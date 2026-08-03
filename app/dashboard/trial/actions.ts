"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

const SelectionSchema = z.object({
  cameraId: z.string().uuid(),
  planCode: z.enum(["basic", "standard", "intensive"]),
});

function trialRedirect(
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/dashboard/trial?${kind}=${encodeURIComponent(message)}`,
  );
}

function trialErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authorized")) {
    return "Somente proprietários e administradores podem configurar o teste.";
  }
  if (normalized.includes("organization_already_paid")) {
    return "Esta empresa já possui um pagamento confirmado e não pode iniciar o teste gratuito.";
  }
  if (normalized.includes("organization_already_subscribed")) {
    return "Esta empresa já possui uma assinatura de câmera.";
  }
  if (normalized.includes("user_trial_already_used")) {
    return "Este usuário já utilizou um teste gratuito em outra empresa.";
  }
  if (normalized.includes("agent_trial_already_used")) {
    return "Esta instalação do Agent já foi utilizada em outro teste gratuito.";
  }
  if (normalized.includes("device_trial_already_used")) {
    return "Este computador já utilizou um teste gratuito do MonitorIA.";
  }
  if (normalized.includes("camera_trial_already_used")) {
    return "Esta câmera já participou de outro teste gratuito.";
  }
  if (normalized.includes("invalid_trial_plan")) {
    return "O plano escolhido não está disponível.";
  }
  if (normalized.includes("trial_selection_locked")) {
    return "A câmera e o modo não podem ser alterados depois do início.";
  }
  if (normalized.includes("trial_not_prepared")) {
    return "Escolha uma câmera e um modo antes de iniciar.";
  }
  if (normalized.includes("email_confirmation_required")) {
    return "Confirme seu e-mail antes de iniciar as 24 horas gratuitas.";
  }
  if (normalized.includes("trial_camera_not_ready")) {
    return "A câmera ainda não está pronta. Ligue o Agent e conclua as pendências exibidas.";
  }
  if (normalized.includes("trial_cannot_be_started")) {
    return "Este teste não pode mais ser iniciado.";
  }

  return "Não foi possível atualizar o teste gratuito. Tente novamente.";
}

async function commercialContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  if (
    organization.role !== "owner" &&
    organization.role !== "admin"
  ) {
    trialRedirect(
      "error",
      "Somente proprietários e administradores podem configurar o teste.",
    );
  }

  return { user, organization };
}

function refreshTrialPaths() {
  revalidatePath("/dashboard/trial");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/search");
}

export async function prepareTrialAction(formData: FormData) {
  const { organization } = await commercialContext();
  const parsed = SelectionSchema.safeParse({
    cameraId: formData.get("camera_id"),
    planCode: formData.get("plan_code"),
  });

  if (!parsed.success) {
    trialRedirect(
      "error",
      "Escolha uma câmera e um dos três modos de análise.",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "prepare_monitoria_trial",
    {
      p_organization_id: organization.id,
      p_camera_id: parsed.data.cameraId,
      p_plan_code: parsed.data.planCode,
    },
  );

  if (error) {
    console.error("Falha ao preparar trial:", error.message);
    trialRedirect("error", trialErrorMessage(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  if (result.success === false) {
    trialRedirect(
      "error",
      trialErrorMessage(String(result.reason ?? "trial_failed")),
    );
  }

  refreshTrialPaths();

  const ready = String(result.status) === "ready";
  trialRedirect(
    "message",
    ready
      ? "Câmera pronta. O relógio só começará quando você confirmar o início."
      : "Seleção salva. Conclua as pendências para liberar o início do teste.",
  );
}

export async function refreshTrialAction() {
  const { organization } = await commercialContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "refresh_monitoria_trial",
    { p_organization_id: organization.id },
  );

  if (error) {
    console.error("Falha ao atualizar prontidão:", error.message);
    trialRedirect("error", trialErrorMessage(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  refreshTrialPaths();
  trialRedirect(
    "message",
    String(result.status) === "ready"
      ? "Tudo pronto. Você já pode iniciar as 24 horas gratuitas."
      : "Verificação concluída. Ainda existem pendências na configuração.",
  );
}

export async function startTrialAction() {
  const { organization } = await commercialContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "start_monitoria_trial",
    { p_organization_id: organization.id },
  );

  if (error) {
    console.error("Falha ao iniciar trial:", error.message);
    trialRedirect("error", trialErrorMessage(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  if (result.success !== true) {
    trialRedirect(
      "error",
      "O teste não foi iniciado. Verifique a câmera e tente novamente.",
    );
  }

  refreshTrialPaths();
  trialRedirect(
    "message",
    result.duplicate === true
      ? "O teste já estava em andamento."
      : "Teste iniciado. A câmera será analisada durante as próximas 24 horas.",
  );
}
