"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";

const MonthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-01$/)
  .default(new Date().toISOString().slice(0, 7) + "-01");

const SettingsSchema = z.object({
  usdToBrl: z.coerce.number().positive().max(100),
  warningTargetPercent: z.coerce.number().int().min(1).max(100),
  criticalTargetPercent: z.coerce.number().int().min(1).max(500),
  projectionMinJobs: z.coerce.number().int().min(1).max(1_000_000),
  projectionMinHours: z.coerce.number().positive().max(744),
  month: MonthSchema,
});

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monthOnly(value: Date) {
  return `${value.toISOString().slice(0, 7)}-01`;
}

function previousMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() - 1, 1));
}

export async function updateAiCostSettingsAction(formData: FormData) {
  const user = await requireInternalOperator();
  const parsed = SettingsSchema.parse({
    usdToBrl: formData.get("usdToBrl"),
    warningTargetPercent: formData.get("warningTargetPercent"),
    criticalTargetPercent: formData.get("criticalTargetPercent"),
    projectionMinJobs: formData.get("projectionMinJobs"),
    projectionMinHours: formData.get("projectionMinHours"),
    month: formData.get("month"),
  });

  if (parsed.criticalTargetPercent < parsed.warningTargetPercent) {
    throw new Error("O limite crítico não pode ser menor que o aviso.");
  }

  const supabase = createAdminClient();
  const { error: updateError } = await supabase
    .from("ai_cost_settings")
    .update({
      usd_to_brl: parsed.usdToBrl,
      warning_target_percent: parsed.warningTargetPercent,
      critical_target_percent: parsed.criticalTargetPercent,
      projection_min_jobs: parsed.projectionMinJobs,
      projection_min_hours: parsed.projectionMinHours,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", 1);

  if (updateError) throw new Error(updateError.message);

  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 370);

  const { error: refreshError } = await supabase.rpc(
    "refresh_monitoria_ai_usage_rollups",
    { p_from: dateOnly(from), p_to: dateOnly(today) },
  );

  if (refreshError) throw new Error(refreshError.message);

  const selectedMonth = new Date(`${parsed.month}T00:00:00.000Z`);
  await Promise.all([
    supabase.rpc("refresh_monitoria_ai_cost_alerts", {
      p_month: parsed.month,
    }),
    supabase.rpc("refresh_monitoria_ai_cost_alerts", {
      p_month: monthOnly(previousMonth(selectedMonth)),
    }),
  ]);

  revalidatePath("/dashboard/operations/ai");
}

export async function refreshAiCostNowAction(formData: FormData) {
  await requireInternalOperator();
  const month = MonthSchema.parse(formData.get("month"));
  const supabase = createAdminClient();
  const today = new Date();
  const from = new Date(today);
  from.setUTCDate(from.getUTCDate() - 10);

  const { error: refreshError } = await supabase.rpc(
    "refresh_monitoria_ai_usage_rollups",
    { p_from: dateOnly(from), p_to: dateOnly(today) },
  );

  if (refreshError) throw new Error(refreshError.message);

  const selectedMonth = new Date(`${month}T00:00:00.000Z`);
  const alertResults = await Promise.all([
    supabase.rpc("refresh_monitoria_ai_cost_alerts", { p_month: month }),
    supabase.rpc("refresh_monitoria_ai_cost_alerts", {
      p_month: monthOnly(previousMonth(selectedMonth)),
    }),
  ]);

  const alertError = alertResults.find((result) => result.error)?.error;
  if (alertError) throw new Error(alertError.message);

  revalidatePath("/dashboard/operations/ai");
}

export async function acknowledgeAiCostAlertAction(formData: FormData) {
  const user = await requireInternalOperator();
  const alertId = z.string().uuid().parse(formData.get("alertId"));
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("ai_cost_alerts")
    .update({
      status: "acknowledged",
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", alertId)
    .neq("status", "resolved");

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/operations/ai");
}
