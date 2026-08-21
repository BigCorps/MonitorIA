"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

type AlertSource = "operational" | "intelligent";

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    throw new Error("Organização não encontrada.");
  }

  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Apenas administradores podem tratar alertas.");
  }

  return createClient();
}

function requiredId(formData: FormData) {
  const value = String(formData.get("alert_id") ?? "").trim();
  if (!value) throw new Error("Alerta não informado.");
  return value;
}

function alertSource(formData: FormData): AlertSource {
  return String(formData.get("source") ?? "operational") === "intelligent"
    ? "intelligent"
    : "operational";
}

function refreshAlertPages() {
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/camera-health");
}

export async function acknowledgeOperationalAlertAction(formData: FormData) {
  const supabase = await context();
  const alertId = requiredId(formData);
  const source = alertSource(formData);
  const rpc =
    source === "intelligent"
      ? "acknowledge_intelligent_alert_v1"
      : "acknowledge_operational_alert_v1";

  const { error } = await supabase.rpc(rpc, {
    p_alert_id: alertId,
  });

  if (error) throw new Error(error.message);
  refreshAlertPages();
}

export async function resolveOperationalAlertAction(formData: FormData) {
  const supabase = await context();
  const alertId = requiredId(formData);
  const source = alertSource(formData);
  const rpc =
    source === "intelligent"
      ? "resolve_intelligent_alert_v1"
      : "resolve_operational_alert_v1";

  const { error } = await supabase.rpc(rpc, {
    p_alert_id: alertId,
  });

  if (error) throw new Error(error.message);
  refreshAlertPages();
}
