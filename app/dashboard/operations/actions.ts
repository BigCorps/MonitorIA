"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) throw new Error("Organização não encontrada.");
  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Apenas owner ou admin pode tratar alertas.");
  }
  return createClient();
}

export async function acknowledgeOperationalAlertAction(formData: FormData) {
  const supabase = await context();
  const alertId = String(formData.get("alert_id") ?? "");
  const { error } = await supabase.rpc("acknowledge_operational_alert_v1", {
    p_alert_id: alertId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operations");
}

export async function resolveOperationalAlertAction(formData: FormData) {
  const supabase = await context();
  const alertId = String(formData.get("alert_id") ?? "");
  const { error } = await supabase.rpc("resolve_operational_alert_v1", {
    p_alert_id: alertId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operations");
}

