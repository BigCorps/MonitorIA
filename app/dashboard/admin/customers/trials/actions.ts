"use server";

import { redirect } from "next/navigation";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
} from "@/src/trial/sales-token";

const COMMERCIAL_PATH = "/dashboard/admin/customers/trials";

function adminRedirect(
  kind: "message" | "error",
  message: string,
  token?: string,
  maxCameras?: number,
): never {
  const params = new URLSearchParams({ [kind]: message });
  if (token) params.set("token", token);
  if (maxCameras) params.set("max_cameras", String(maxCameras));
  redirect(`${COMMERCIAL_PATH}?${params.toString()}`);
}

function cleanEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export async function addSalesOperatorAction(formData: FormData) {
  const manager = await requireInternalOperator();
  const name = cleanText(formData.get("operator_name"), 120);
  const email = cleanEmail(formData.get("operator_email"));

  if (name.length < 2 || !email.includes("@")) {
    adminRedirect("error", "Informe o nome e um e-mail válido do vendedor.");
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { data: existing, error: existingError } = await admin
    .from("sales_operators")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingError) {
    console.error("Falha ao consultar vendedor:", existingError.message);
    adminRedirect("error", "Não foi possível verificar este vendedor.");
  }

  if (existing) {
    const { error } = await admin
      .from("sales_operators")
      .update({
        name,
        active: true,
        deactivated_at: null,
        updated_at: now,
      })
      .eq("id", String(existing.id));

    if (error) {
      console.error("Falha ao reativar vendedor:", error.message);
      adminRedirect("error", "Não foi possível reativar este vendedor.");
    }

    adminRedirect(
      "message",
      `${name} foi reativado. Envie monitoria.cam/comercial para ele acessar.`,
    );
  }

  const { error } = await admin.from("sales_operators").insert({
    name,
    email,
    active: true,
    created_by: manager.id,
  });

  if (error) {
    console.error("Falha ao criar vendedor:", error.message);
    adminRedirect("error", "Não foi possível adicionar este vendedor.");
  }

  adminRedirect(
    "message",
    `${name} foi liberado. Envie monitoria.cam/comercial para ele entrar com Google ou receber um link no e-mail.`,
  );
}

export async function setSalesOperatorActiveAction(formData: FormData) {
  await requireInternalOperator();
  const operatorId = String(formData.get("operator_id") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "true";

  if (!operatorId) {
    adminRedirect("error", "Vendedor inválido.");
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("sales_operators")
    .update({
      active,
      deactivated_at: active ? null : now,
      updated_at: now,
    })
    .eq("id", operatorId);

  if (error) {
    console.error("Falha ao alterar vendedor:", error.message);
    adminRedirect("error", "Não foi possível alterar o acesso do vendedor.");
  }

  adminRedirect(
    "message",
    active ? "Acesso comercial reativado." : "Acesso comercial desativado.",
  );
}

export async function createSalesTrialInviteAction(formData: FormData) {
  const access = await requireCommercialAccess();
  const leadName = cleanText(formData.get("lead_name"), 120);
  const leadEmail = cleanEmail(formData.get("lead_email"));
  const companyName = cleanText(formData.get("company_name"), 160);
  const requestedMax = Number(formData.get("max_cameras") ?? 6);
  const maxCameras = Number.isFinite(requestedMax)
    ? Math.max(1, Math.min(6, Math.floor(requestedMax)))
    : 6;

  if (leadName.length < 2 || !leadEmail.includes("@")) {
    adminRedirect("error", "Informe o nome e um e-mail válido do lead.");
  }

  const admin = createAdminClient();
  let salesOperatorId: string | null = access.operator?.id ?? null;

  if (access.isManager) {
    const requestedOperatorId = String(
      formData.get("sales_operator_id") ?? "",
    ).trim();

    if (requestedOperatorId) {
      const { data: assigned, error: assignedError } = await admin
        .from("sales_operators")
        .select("id")
        .eq("id", requestedOperatorId)
        .eq("active", true)
        .maybeSingle();

      if (assignedError || !assigned) {
        adminRedirect("error", "O vendedor selecionado não está disponível.");
      }

      salesOperatorId = String(assigned.id);
    }
  }

  const token = createSalesTrialToken();
  const { error } = await admin.from("sales_trial_invites").insert({
    token_hash: hashSalesTrialToken(token),
    lead_name: leadName,
    lead_email: leadEmail,
    company_name: companyName || null,
    selected_plan_code: "intensive",
    duration_minutes: 60,
    max_cameras: maxCameras,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: access.user.id,
    sales_operator_id: salesOperatorId,
    metadata: {
      source: "internal_sales_panel",
      version: "b3",
      salesOperatorId,
    },
  });

  if (error) {
    console.error("Falha ao criar convite comercial:", error.message);
    adminRedirect("error", "Não foi possível criar o convite comercial.");
  }

  adminRedirect(
    "message",
    "Convite criado. Copie o link abaixo agora; por segurança ele não poderá ser recuperado depois.",
    token,
    maxCameras,
  );
}

export async function revokeSalesTrialInviteAction(formData: FormData) {
  const access = await requireCommercialAccess();
  const inviteId = String(formData.get("invite_id") ?? "").trim();

  if (!inviteId) {
    adminRedirect("error", "Convite inválido.");
  }

  const admin = createAdminClient();
  const { data: invite, error: lookupError } = await admin
    .from("sales_trial_invites")
    .select("id,sales_operator_id,redeemed_at")
    .eq("id", inviteId)
    .maybeSingle();

  if (lookupError || !invite) {
    adminRedirect("error", "Convite não encontrado.");
  }

  if (
    !access.isManager &&
    String(invite.sales_operator_id ?? "") !== String(access.operator?.id ?? "")
  ) {
    adminRedirect("error", "Você não pode alterar um lead de outro vendedor.");
  }

  if (invite.redeemed_at) {
    adminRedirect("error", "Este convite já foi utilizado e não pode ser cancelado.");
  }

  const { error } = await admin
    .from("sales_trial_invites")
    .update({
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .is("redeemed_at", null);

  if (error) {
    console.error("Falha ao cancelar convite comercial:", error.message);
    adminRedirect("error", "Não foi possível cancelar o convite.");
  }

  adminRedirect("message", "Convite cancelado.");
}
