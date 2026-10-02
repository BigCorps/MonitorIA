"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
} from "@/src/trial/sales-token";
import { VIP_PLAN_CODES } from "@/src/vip/types";

const LIST_PATH = "/comercial/vip";

function go(
  kind: "message" | "error",
  message: string,
  extras: Record<string, string> = {},
): never {
  const params = new URLSearchParams({ [kind]: message, ...extras });
  redirect(`${LIST_PATH}?${params.toString()}`);
}

async function leadContext(leadId: string) {
  const parsed = z.string().uuid().safeParse(leadId);
  if (!parsed.success) go("error", "Lead VIP inválido.");

  const access = await requireCommercialAccess();
  const admin = createAdminClient();
  const { data: lead, error } = await admin
    .from("vip_lead_requests")
    .select(
      "id,sales_operator_id,status,company_name,expected_camera_count,project_kind",
    )
    .eq("id", parsed.data)
    .maybeSingle();

  if (error || !lead) go("error", "Lead VIP não encontrado.");

  if (
    !access.isManager &&
    String(lead.sales_operator_id ?? "") !== String(access.operator?.id ?? "")
  ) {
    go("error", "Este interesse está atribuído a outro vendedor.");
  }

  return { access, admin, lead };
}

export async function setVipLeadStatusAction(formData: FormData) {
  const leadId = String(formData.get("lead_request_id") ?? "");
  const target = z.enum(["contacted", "disqualified"]).safeParse(
    String(formData.get("status") ?? ""),
  );
  const { admin, lead } = await leadContext(leadId);

  if (!target.success) go("error", "Status comercial inválido.");

  if (!["new", "contacted", "qualified"].includes(String(lead.status))) {
    go("error", "Este lead não pode mais ser alterado por esta ação.");
  }

  const now = new Date().toISOString();
  const patch =
    target.data === "contacted"
      ? {
          status: "contacted",
          contacted_at: now,
          updated_at: now,
        }
      : {
          status: "disqualified",
          disqualified_at: now,
          updated_at: now,
        };

  const { error } = await admin
    .from("vip_lead_requests")
    .update(patch)
    .eq("id", String(lead.id));

  if (error) {
    console.error("vip_lead_status_update:", error.message);
    go("error", "Não foi possível atualizar este interesse.");
  }

  go(
    "message",
    target.data === "contacted"
      ? "Lead marcado como contatado."
      : "Lead arquivado.",
  );
}

export async function convertVipLeadAction(formData: FormData) {
  const leadId = String(formData.get("lead_request_id") ?? "");
  const plan = z.enum(VIP_PLAN_CODES).safeParse(
    String(formData.get("plan_code") ?? ""),
  );
  const cameraCount = z.coerce
    .number()
    .int()
    .min(10)
    .max(100000)
    .safeParse(formData.get("camera_count"));

  const { access, admin, lead } = await leadContext(leadId);

  if (!plan.success || !cameraCount.success) {
    go("error", "Escolha um pacote VIP e informe pelo menos 10 câmeras.");
  }

  const token = createSalesTrialToken();
  const tokenHash = hashSalesTrialToken(token);
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await admin.rpc(
    "convert_vip_lead_request_v1",
    {
      p_lead_request_id: String(lead.id),
      p_plan_code: plan.data,
      p_camera_count: cameraCount.data,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_actor_user_id: access.user.id,
      p_actor_sales_operator_id: access.isManager
        ? null
        : access.operator?.id ?? null,
    },
  );

  if (error) {
    console.error("convert_vip_lead_request_v1:", error.message);
    go(
      "error",
      "Não foi possível criar o Projeto VIP e o convite. Nenhuma conversão parcial foi mantida.",
    );
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  if (result.success !== true) {
    go("error", "A conversão VIP não foi concluída.");
  }

  go(
    "message",
    "Projeto VIP criado e convite de 60 minutos preparado.",
    {
      token,
      company: String(lead.company_name),
      project: String(result.projectId ?? ""),
    },
  );
}
