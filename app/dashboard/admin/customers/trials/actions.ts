"use server";

import { redirect } from "next/navigation";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
} from "@/src/trial/sales-token";

function adminRedirect(
  kind: "message" | "error",
  message: string,
  token?: string,
): never {
  const params = new URLSearchParams({ [kind]: message });
  if (token) params.set("token", token);
  redirect(`/dashboard/admin/customers/trials?${params.toString()}`);
}

export async function createSalesTrialInviteAction(formData: FormData) {
  const operator = await requireInternalOperator();
  const leadName = String(formData.get("lead_name") ?? "").trim();
  const leadEmail = String(formData.get("lead_email") ?? "")
    .trim()
    .toLowerCase();
  const companyName = String(formData.get("company_name") ?? "").trim();
  const requestedMax = Number(formData.get("max_cameras") ?? 6);
  const maxCameras = Number.isFinite(requestedMax)
    ? Math.max(1, Math.min(6, Math.floor(requestedMax)))
    : 6;

  if (leadName.length < 2 || !leadEmail.includes("@")) {
    adminRedirect("error", "Informe o nome e um e-mail válido do lead.");
  }

  const token = createSalesTrialToken();
  const admin = createAdminClient();
  const { error } = await admin.from("sales_trial_invites").insert({
    token_hash: hashSalesTrialToken(token),
    lead_name: leadName,
    lead_email: leadEmail,
    company_name: companyName || null,
    selected_plan_code: "intensive",
    duration_minutes: 60,
    max_cameras: maxCameras,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: operator.id,
    metadata: {
      source: "internal_sales_panel",
      version: "b2",
    },
  });

  if (error) {
    console.error("Falha ao criar convite comercial:", error.message);
    adminRedirect("error", "Não foi possível criar o convite comercial.");
  }

  adminRedirect(
    "message",
    "Convite criado. Copie o link abaixo agora; o token não fica salvo em texto puro.",
    token,
  );
}

export async function revokeSalesTrialInviteAction(formData: FormData) {
  await requireInternalOperator();
  const inviteId = String(formData.get("invite_id") ?? "");

  if (!inviteId) {
    adminRedirect("error", "Convite inválido.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sales_trial_invites")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("redeemed_at", null);

  if (error) {
    console.error("Falha ao cancelar convite comercial:", error.message);
    adminRedirect("error", "Não foi possível cancelar o convite.");
  }

  adminRedirect("message", "Convite cancelado.");
}
