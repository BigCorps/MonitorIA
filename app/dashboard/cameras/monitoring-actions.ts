"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  CAMERA_ANALYSIS_PLANS,
  normalizeAnalysisPlan,
} from "@/src/lib/analysis-plans";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { MonitoringActionState } from "./monitoring-action-state";

const IdSchema = z.string().uuid();
const TimeSchema = /^\d{2}:\d{2}$/;

export async function updateMonitoringSettingsAction(
  _previousState: MonitoringActionState,
  formData: FormData,
): Promise<MonitoringActionState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return {
      status: "error",
      message: "Sua conta não pode alterar esta câmera.",
    };
  }

  const cameraId = String(formData.get("camera_id") ?? "");
  if (!IdSchema.safeParse(cameraId).success) {
    return {
      status: "error",
      message: "Identificador da câmera inválido.",
    };
  }

  const adaptive = formData.get("adaptive") === "on";

  const overlayCandidate = String(
    formData.get("overlay_mask") ?? "auto",
  );
  const overlayMask = [
    "auto",
    "none",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
  ].includes(overlayCandidate)
    ? overlayCandidate
    : "auto";

  const scheduleMode =
    formData.get("schedule_mode") === "weekly"
      ? "weekly"
      : "always";

  let monitoringSchedule: Record<string, unknown> = {
    mode: "always",
  };

  if (scheduleMode === "weekly") {
    const start = String(formData.get("schedule_start") ?? "");
    const end = String(formData.get("schedule_end") ?? "");
    const days = formData
      .getAll("weekday")
      .map((value) => Number(value))
      .filter(
        (value) =>
          Number.isInteger(value) && value >= 0 && value <= 6,
      );

    if (
      !TimeSchema.test(start) ||
      !TimeSchema.test(end) ||
      !days.length
    ) {
      return {
        status: "error",
        message:
          "Selecione os dias e informe início e fim do horário.",
      };
    }

    monitoringSchedule = {
      mode: "weekly",
      weekly: days.map((day) => ({ day, start, end })),
      outsideMode:
        formData.get("outside_mode") === "significant_only"
          ? "significant_only"
          : "off",
    };
  }

  const supabase = createAdminClient();

  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("id,analysis_plan_code")
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (cameraError || !camera) {
    return {
      status: "error",
      message: "A câmera não foi encontrada.",
    };
  }

  // O plano comercial não vem do formulário. Isso impede que a
  // configuração técnica contorne a assinatura da câmera.
  const plan = normalizeAnalysisPlan(
    (camera as { analysis_plan_code?: unknown }).analysis_plan_code,
  );
  const settings = CAMERA_ANALYSIS_PLANS[plan];

  const { error } = await supabase
    .from("cameras")
    .update({
      capture_interval_seconds:
        settings.captureIntervalSeconds,
      consolidation_interval_seconds:
        settings.consolidationIntervalSeconds,
      motion_start_threshold:
        settings.motionStartThreshold,
      motion_continue_threshold:
        settings.motionContinueThreshold,
      event_close_after_seconds:
        settings.eventCloseAfterSeconds,
      motion_start_consecutive_frames:
        settings.motionStartConsecutiveFrames,
      motion_end_consecutive_frames:
        settings.motionEndConsecutiveFrames,
      motion_cooldown_seconds:
        settings.motionCooldownSeconds,
      motion_adaptive_enabled: adaptive,
      motion_overlay_mask: overlayMask,
      monitoring_schedule: monitoringSchedule,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cameraId)
    .eq("organization_id", organization.id);

  if (error) {
    console.error(
      "Falha ao atualizar monitoramento:",
      error.message,
    );

    return {
      status: "error",
      message: "Não foi possível salvar a configuração.",
    };
  }

  await supabase.from("audit_logs").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "camera.monitoring_settings_updated",
    entity_type: "camera",
    entity_id: cameraId,
    metadata: {
      plan_code: plan,
      adaptive,
      overlay_mask: overlayMask,
      monitoring_schedule: monitoringSchedule,
    },
  });

  revalidatePath(`/dashboard/cameras/${cameraId}`);
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message:
      "Configuração salva. O Agent sincronizará em até cinco minutos ou após reiniciar.",
  };
}
