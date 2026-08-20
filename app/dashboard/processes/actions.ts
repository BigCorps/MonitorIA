"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

type ProcessStepInput = {
  stepCode: string;
  name: string;
  description?: string;
  required: boolean;
  repeatable?: boolean;
  terminal?: boolean;
  acceptedChapterTypes: string[];
  minimumConfidence?: number;
  maximumGapSeconds?: number | null;
  evidenceRequired?: boolean;
};

const CHAPTER_TYPES = new Set([
  "arrival",
  "waiting",
  "service_started",
  "service_continued",
  "terminal_activity",
  "object_handoff",
  "departure",
  "opening_step",
  "closing_step",
  "equipment_activity",
  "restricted_access",
  "state_change",
  "presence",
]);

async function manageContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    throw new Error("Organização não encontrada.");
  }

  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Apenas owner ou admin pode configurar processos.");
  }

  return {
    organization,
    supabase: await createClient(),
  };
}

function parseSteps(value: FormDataEntryValue | null): ProcessStepInput[] {
  if (typeof value !== "string") {
    throw new Error("Etapas não informadas.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Etapas inválidas.");
  }

  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 30) {
    throw new Error("Informe entre 1 e 30 etapas.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Etapa ${index + 1} inválida.`);
    }

    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const stepCode = String(row.stepCode ?? "").trim();
    const acceptedChapterTypes = Array.isArray(row.acceptedChapterTypes)
      ? row.acceptedChapterTypes
          .map(String)
          .filter((chapter) => CHAPTER_TYPES.has(chapter))
      : [];

    if (
      name.length < 2 ||
      !/^[a-z0-9][a-z0-9_.-]{1,79}$/.test(stepCode) ||
      acceptedChapterTypes.length < 1
    ) {
      throw new Error(`Revise a etapa ${index + 1}.`);
    }

    return {
      stepCode,
      name,
      description: String(row.description ?? "").trim(),
      required: Boolean(row.required),
      repeatable: Boolean(row.repeatable),
      terminal: Boolean(row.terminal),
      acceptedChapterTypes,
      minimumConfidence: 0.5,
      maximumGapSeconds: null,
      evidenceRequired: true,
    };
  });
}

export async function saveProcessDefinitionAction(formData: FormData) {
  const { organization, supabase } = await manageContext();

  const processCode = String(formData.get("process_code") ?? "").trim();
  const sessionType = String(formData.get("session_type") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const scope = String(formData.get("scope") ?? "organization");
  const scopeId = String(formData.get("scope_id") ?? "").trim() || null;
  const strictness = String(formData.get("strictness") ?? "balanced");
  const steps = parseSteps(formData.get("steps_json"));

  if (
    !["organization", "site", "camera"].includes(scope) ||
    !["flexible", "balanced", "strict"].includes(strictness)
  ) {
    throw new Error("Configuração inválida.");
  }

  if (scope === "organization" && scopeId) {
    throw new Error("Escopo da empresa não utiliza local ou câmera.");
  }

  if (scope !== "organization" && !scopeId) {
    throw new Error("Escolha onde esta configuração será aplicada.");
  }

  const { error } = await supabase.rpc(
    "save_operational_process_definition_v1",
    {
      p_organization_id: organization.id,
      p_process_code: processCode,
      p_name: name,
      p_description: description,
      p_session_type: sessionType,
      p_scope: scope,
      p_scope_id: scopeId,
      p_strictness: strictness,
      p_steps: steps,
    },
  );

  if (error) {
    console.error("Falha ao salvar processo:", error.message);
    throw new Error("Não foi possível salvar a nova versão do processo.");
  }

  revalidatePath("/dashboard/processes");
}

export async function pauseProcessDefinitionAction(formData: FormData) {
  const { supabase } = await manageContext();
  const definitionId = String(formData.get("definition_id") ?? "");

  const { error } = await supabase.rpc(
    "pause_operational_process_definition_v1",
    {
      p_definition_id: definitionId,
    },
  );

  if (error) {
    throw new Error("Não foi possível desativar esta personalização.");
  }

  revalidatePath("/dashboard/processes");
}

export async function restoreProcessDefinitionAction(formData: FormData) {
  const { supabase } = await manageContext();
  const definitionId = String(formData.get("definition_id") ?? "");

  const { error } = await supabase.rpc(
    "restore_operational_process_definition_v1",
    {
      p_definition_id: definitionId,
    },
  );

  if (error) {
    throw new Error("Não foi possível restaurar esta versão.");
  }

  revalidatePath("/dashboard/processes");
}
