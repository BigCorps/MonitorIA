"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
} from "@/src/trial/sales-token";
import { VIP_PLAN_CODES, VIP_PROJECT_KINDS } from "@/src/vip/types";

const schema = z.object({
  lead_name: z.string().trim().min(2).max(120),
  lead_email: z.string().trim().toLowerCase().email().max(254),
  company_name: z.string().trim().min(2).max(160),
  project_kind: z.enum(VIP_PROJECT_KINDS),
  expected_camera_count: z.coerce.number().int().min(10).max(100000),
  objective: z.string().trim().max(2000).optional(),
  plan_code: z.enum(VIP_PLAN_CODES),
});

function go(kind: "message" | "error", value: string, extras: Record<string, string> = {}): never {
  const query = new URLSearchParams({ [kind]: value, ...extras });
  redirect(`/comercial/vip/nova?${query.toString()}`);
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function createVipAssistedPresentationAction(formData: FormData) {
  const parsed = schema.safeParse({
    lead_name: text(formData.get("lead_name")),
    lead_email: text(formData.get("lead_email")),
    company_name: text(formData.get("company_name")),
    project_kind: text(formData.get("project_kind")),
    expected_camera_count: formData.get("expected_camera_count"),
    objective: text(formData.get("objective")) || undefined,
    plan_code: text(formData.get("plan_code")),
  });

  if (!parsed.success) {
    go("error", "Revise os dados. O MonitorIA VIP começa a partir de 10 câmeras.");
  }

  const input = parsed.data;
  const access = await requireCommercialAccess();
  const admin = createAdminClient();

  let operatorId = access.operator?.id ?? null;
  if (!operatorId) {
    const { data: fallback, error } = await admin
      .from("sales_operators")
      .select("id")
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !fallback?.id) {
      go("error", "Nenhum especialista VIP ativo está disponível para esta apresentação.");
    }
    operatorId = String(fallback.id);
  }

  const { data: existing, error: existingError } = await admin
    .from("vip_lead_requests")
    .select("id,sales_operator_id,status")
    .ilike("lead_email", input.lead_email)
    .in("status", ["new", "contacted", "qualified"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    go("error", "Não foi possível verificar oportunidades existentes para este e-mail.");
  }

  if (
    existing?.sales_operator_id &&
    !access.isManager &&
    String(existing.sales_operator_id) !== operatorId
  ) {
    go("error", "Este lead já pertence a outro especialista VIP.");
  }

  const leadPayload = {
    sales_operator_id: existing?.sales_operator_id ?? operatorId,
    lead_name: input.lead_name,
    lead_email: input.lead_email,
    company_name: input.company_name,
    phone: null,
    project_kind: input.project_kind,
    expected_camera_count: input.expected_camera_count,
    objective: input.objective ?? null,
    status: "qualified",
    source: "vip_sales_assisted",
    acquisition: {
      source: "vip_sales_assisted",
      createdBySeller: true,
      presentationMode: "guided",
    },
    last_submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let leadId = existing?.id ? String(existing.id) : null;
  if (leadId) {
    const { error } = await admin
      .from("vip_lead_requests")
      .update(leadPayload)
      .eq("id", leadId);
    if (error) go("error", "Não foi possível preparar a oportunidade VIP.");
  } else {
    const { data, error } = await admin
      .from("vip_lead_requests")
      .insert({
        ...leadPayload,
        first_submitted_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error || !data?.id) {
      go("error", "Não foi possível criar a oportunidade VIP.");
    }
    leadId = String(data.id);
  }

  const token = createSalesTrialToken();
  const tokenHash = hashSalesTrialToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const assignedOperatorId = String(existing?.sales_operator_id ?? operatorId);

  const { data: conversion, error: conversionError } = await admin.rpc(
    "convert_vip_lead_request_v1",
    {
      p_lead_request_id: leadId,
      p_plan_code: input.plan_code,
      p_camera_count: input.expected_camera_count,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_actor_user_id: access.user.id,
      p_actor_sales_operator_id: assignedOperatorId,
    },
  );

  if (conversionError) {
    console.error("vip_assisted_conversion:", conversionError.message);
    go(
      "error",
      "A oportunidade foi salva, mas o Projeto/convite não pôde ser criado. Ela continua disponível na carteira para nova tentativa.",
    );
  }

  const result =
    conversion && typeof conversion === "object" && !Array.isArray(conversion)
      ? (conversion as Record<string, unknown>)
      : {};

  if (result.success !== true) {
    go("error", "O Projeto VIP não foi concluído.");
  }

  go("message", "Apresentação assistida pronta para compartilhar.", {
    token,
    project: String(result.projectId ?? ""),
    invite: String(result.salesInviteId ?? ""),
    company: input.company_name,
  });
}
