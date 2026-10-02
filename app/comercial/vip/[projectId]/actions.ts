"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  presentVipProposal,
  reopenVipProposal,
} from "@/src/vip/proposal";
import { VIP_PLAN_CODES } from "@/src/vip/types";

function projectRedirect(
  projectId: string,
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/comercial/vip/${encodeURIComponent(projectId)}?${kind}=${encodeURIComponent(message)}`,
  );
}

async function commercialProjectContext(projectId: string) {
  const parsed = z.string().uuid().safeParse(projectId);
  if (!parsed.success) {
    redirect("/comercial/vip");
  }

  const access = await requireCommercialAccess();
  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("vip_projects")
    .select("id,sales_operator_id,status")
    .eq("id", parsed.data)
    .maybeSingle();

  if (error || !project) {
    redirect("/comercial/vip");
  }

  if (
    !access.isManager &&
    String(project.sales_operator_id) !== String(access.operator?.id ?? "")
  ) {
    redirect("/comercial/vip");
  }

  return { access, projectId: parsed.data };
}

export async function presentVipProposalAction(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const { access } = await commercialProjectContext(projectId);

  const planCode = z.enum(VIP_PLAN_CODES).safeParse(
    String(formData.get("plan_code") ?? ""),
  );
  const cameraCount = z.coerce
    .number()
    .int()
    .min(10)
    .max(100000)
    .safeParse(formData.get("camera_count"));

  if (!planCode.success || !cameraCount.success) {
    projectRedirect(
      projectId,
      "error",
      "Escolha um pacote VIP e informe pelo menos 10 câmeras.",
    );
  }

  try {
    const result = await presentVipProposal({
      projectId,
      planCode: planCode.data,
      cameraCount: cameraCount.data,
      actorUserId: access.user.id,
      actorSalesOperatorId: access.isManager
        ? null
        : access.operator?.id ?? null,
    });

    projectRedirect(
      projectId,
      "message",
      `Proposta VIP v${result.version} apresentada. O cliente já pode revisar mensal e anual.`,
    );
  } catch (error) {
    console.error(
      "Falha ao apresentar proposta VIP:",
      error instanceof Error ? error.message : String(error),
    );
    projectRedirect(
      projectId,
      "error",
      "Não foi possível apresentar a proposta. O piloto precisa estar concluído e o projeto deve pertencer a este vendedor.",
    );
  }
}

export async function reopenVipProposalAction(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "").trim();
  const { access } = await commercialProjectContext(projectId);

  try {
    await reopenVipProposal({
      projectId,
      actorUserId: access.user.id,
      actorSalesOperatorId: access.isManager
        ? null
        : access.operator?.id ?? null,
    });

    projectRedirect(
      projectId,
      "message",
      "Cobrança anterior cancelada e proposta reaberta. Agora você pode ajustar pacote ou quantidade.",
    );
  } catch (error) {
    console.error(
      "Falha ao reabrir proposta VIP:",
      error instanceof Error ? error.message : String(error),
    );
    projectRedirect(
      projectId,
      "error",
      "Não foi possível reabrir. Propostas já pagas não podem ser alteradas por este fluxo.",
    );
  }
}
