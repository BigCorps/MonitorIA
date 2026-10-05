"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { notifyVipLeadRequest } from "@/src/lib/vip-lead-notification";
import { VIP_PROJECT_KINDS } from "@/src/vip/types";

const schema = z.object({
  lead_name: z.string().trim().min(2).max(120),
  lead_email: z.string().trim().toLowerCase().email().max(254),
  company_name: z.string().trim().min(2).max(160),
  phone: z.string().trim().min(8).max(40),
  project_kind: z.enum(VIP_PROJECT_KINDS),
  expected_camera_count: z.coerce.number().int().min(10).max(100000),
  objective: z.string().trim().max(2000).optional(),
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(160).optional(),
  utm_content: z.string().trim().max(160).optional(),
  referrer: z.string().trim().max(500).optional(),
});

function successRedirect(): never {
  redirect("/?contato=enviado#contato");
}

function errorRedirect(message: string): never {
  redirect(`/?contato=erro&mensagem=${encodeURIComponent(message)}#contato`);
}

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

export async function requestVipContactAction(formData: FormData) {
  // Honeypot: bots normalmente preenchem este campo invisível.
  if (text(formData.get("website"))) {
    successRedirect();
  }

  const startedAt = Number(formData.get("started_at") ?? 0);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= 0 && elapsed < 1200) {
      // Não revela ao bot que a submissão foi descartada.
      successRedirect();
    }
  }

  const parsed = schema.safeParse({
    lead_name: text(formData.get("lead_name")),
    lead_email: text(formData.get("lead_email")),
    company_name: text(formData.get("company_name")),
    phone: text(formData.get("phone")),
    project_kind: text(formData.get("project_kind")),
    expected_camera_count: formData.get("expected_camera_count"),
    objective: text(formData.get("objective")) || undefined,
    utm_source: text(formData.get("utm_source")) || undefined,
    utm_medium: text(formData.get("utm_medium")) || undefined,
    utm_campaign: text(formData.get("utm_campaign")) || undefined,
    utm_content: text(formData.get("utm_content")) || undefined,
    referrer: text(formData.get("referrer")) || undefined,
  });

  if (!parsed.success) {
    errorRedirect(
      "Revise seus dados. O MonitorIA VIP começa a partir de 10 câmeras.",
    );
  }

  const input = parsed.data;
  const admin = createAdminClient();

  const { data: operator, error: operatorError } = await admin
    .from("sales_operators")
    .select("id,name,email")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (operatorError) {
    console.error("vip_landing_operator_lookup:", operatorError.message);
    errorRedirect("Não foi possível registrar seu interesse agora. Tente novamente.");
  }

  const acquisition = {
    source: "vip_landing",
    utmSource: input.utm_source ?? null,
    utmMedium: input.utm_medium ?? null,
    utmCampaign: input.utm_campaign ?? null,
    utmContent: input.utm_content ?? null,
    referrer: input.referrer ?? null,
    landingVersion: "gate6-v1",
  };

  const { data: existing, error: lookupError } = await admin
    .from("vip_lead_requests")
    .select("id,sales_operator_id,status")
    .ilike("lead_email", input.lead_email)
    .in("status", ["new", "contacted", "qualified"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("vip_landing_lead_lookup:", lookupError.message);
    errorRedirect("Não foi possível registrar seu interesse agora. Tente novamente.");
  }

  const assignedOperatorId =
    existing?.sales_operator_id ?? operator?.id ?? null;

  const payload = {
    sales_operator_id: assignedOperatorId,
    lead_name: input.lead_name,
    lead_email: input.lead_email,
    company_name: input.company_name,
    phone: input.phone,
    project_kind: input.project_kind,
    expected_camera_count: input.expected_camera_count,
    objective: input.objective ?? null,
    source: "vip_landing",
    acquisition,
    last_submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  async function notifySavedLead(requestId: string) {
    let sellerName =
      assignedOperatorId && String(operator?.id ?? "") === String(assignedOperatorId)
        ? String(operator?.name ?? "")
        : "";
    let sellerEmail =
      assignedOperatorId && String(operator?.id ?? "") === String(assignedOperatorId)
        ? String(operator?.email ?? "")
        : "";

    if (assignedOperatorId && !sellerEmail) {
      const { data: assignedSeller, error: sellerError } = await admin
        .from("sales_operators")
        .select("name,email")
        .eq("id", String(assignedOperatorId))
        .maybeSingle();

      if (sellerError) {
        console.error("vip_lead_seller_lookup:", sellerError.message);
      } else {
        sellerName = String(assignedSeller?.name ?? "");
        sellerEmail = String(assignedSeller?.email ?? "");
      }
    }

    const notification = await notifyVipLeadRequest({
      requestId,
      leadName: input.lead_name,
      leadEmail: input.lead_email,
      companyName: input.company_name,
      phone: input.phone,
      projectKind: input.project_kind,
      expectedCameraCount: input.expected_camera_count,
      objective: input.objective ?? null,
      sellerName: sellerName || null,
      sellerEmail: sellerEmail || null,
    });

    if (!notification.seller.ok) {
      console.error("vip_lead_seller_email:", notification.seller.error);
    }
    if (!notification.lead.ok) {
      console.error("vip_lead_confirmation_email:", notification.lead.error);
    }
  }

  if (existing) {
    const { error } = await admin
      .from("vip_lead_requests")
      .update(payload)
      .eq("id", String(existing.id));

    if (error) {
      console.error("vip_landing_lead_update:", error.message);
      errorRedirect("Não foi possível registrar seu interesse agora. Tente novamente.");
    }

    await notifySavedLead(String(existing.id));
    successRedirect();
  }

  const { data: inserted, error } = await admin
    .from("vip_lead_requests")
    .insert({
      ...payload,
      status: "new",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // Corrida entre duas submissões do mesmo e-mail: mantém uma só oportunidade.
    const { data: concurrent } = await admin
      .from("vip_lead_requests")
      .select("id")
      .ilike("lead_email", input.lead_email)
      .in("status", ["new", "contacted", "qualified"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (concurrent?.id) {
      await admin
        .from("vip_lead_requests")
        .update(payload)
        .eq("id", String(concurrent.id));
      await notifySavedLead(String(concurrent.id));
      successRedirect();
    }
  }

  if (error || !inserted?.id) {
    console.error("vip_landing_lead_insert:", error?.message ?? "missing_inserted_id");
    errorRedirect("Não foi possível registrar seu interesse agora. Tente novamente.");
  }

  await notifySavedLead(String(inserted.id));
  successRedirect();
}
