"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) throw new Error("Organização não encontrada.");
  if (!['owner','admin'].includes(organization.role)) throw new Error("Apenas owner ou admin pode executar esta ação.");
  return { organization, supabase: await createClient() };
}

export async function approveCameraHealthBaselineAction(formData: FormData) {
  const { supabase } = await context();
  const baselineId = String(formData.get("baseline_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 600);
  const { error } = await supabase.rpc("approve_camera_health_baseline_v1", { p_baseline_id: baselineId, p_notes: notes });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/camera-health");
}

export async function rejectCameraHealthBaselineAction(formData: FormData) {
  const { supabase } = await context();
  const baselineId = String(formData.get("baseline_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 600);
  const { error } = await supabase.rpc("reject_camera_health_baseline_v1", { p_baseline_id: baselineId, p_notes: notes });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/camera-health");
}

export async function dismissCameraHealthIncidentAction(formData: FormData) {
  const { supabase } = await context();
  const incidentId = String(formData.get("incident_id") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 600);
  const { error } = await supabase.rpc("dismiss_camera_health_incident_v1", { p_incident_id: incidentId, p_notes: notes });
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/camera-health");
}
