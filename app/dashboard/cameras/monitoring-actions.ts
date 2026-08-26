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

function timeToMinute(value: string) {
  if (!TimeSchema.test(value)) return null;

  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

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

  const operationalAccessEnabled =
    formData.get("operational_access_enabled") === "on";
  const operationalOpeningTime = String(
    formData.get("operational_opening_time") ?? "08:00",
  );
  const operationalClosingTime = String(
    formData.get("operational_closing_time") ?? "18:00",
  );
  const openingMinute = timeToMinute(operationalOpeningTime);
  const closingMinute = timeToMinute(operationalClosingTime);

  if (
    operationalAccessEnabled &&
    (
      openingMinute === null ||
      closingMinute === null ||
      openingMinute === closingMinute
    )
  ) {
    return {
      status: "error",
      message:
        "Informe horários aproximados diferentes para abertura e fechamento.",
    };
  }

  const scheduleMode =
    formData.get("schedule_mode") === "weekly"
      ? "weekly"
      : "always";

  let monitoringSchedule: Record<string, unknown> = {
    mode: "always",
  };

  if (operationalAccessEnabled) {
    monitoringSchedule = {
      mode: "always",
      operationalAccess: {
        enabled: true,
        openingTime: operationalOpeningTime,
        closingTime: operationalClosingTime,
        referenceCamera: true,
      },
    };
  } else if (scheduleMode === "weekly") {
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
    .select("id,site_id,analysis_plan_code")
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (cameraError || !camera) {
    return {
      status: "error",
      message: "A câmera não foi encontrada.",
    };
  }

  // A ativação/desativação é feita por RPC para manter, na mesma transação:
  // câmera de referência, marcador visual e horário operacional do local.
  const { error: operationalAccessError } = await supabase.rpc(
    "set_camera_operational_access_v1",
    {
      p_organization_id: organization.id,
      p_camera_id: cameraId,
      p_enabled: operationalAccessEnabled,
      p_opening_minute: operationalAccessEnabled
        ? openingMinute
        : null,
      p_closing_minute: operationalAccessEnabled
        ? closingMinute
        : null,
    },
  );

  if (operationalAccessError) {
    console.error(
      "Falha ao configurar abertura/fechamento:",
      operationalAccessError.message,
    );

    if (
      operationalAccessError.message.includes(
        "operational_access_zone_required",
      )
    ) {
      return {
        status: "error",
        message:
          "A câmera foi reconhecida, mas o perfil ativo ainda não possui uma área de porta, portão, grade, cancela ou persiana adequada. Ajuste as áreas da câmera e tente novamente.",
      };
    }

    if (
      operationalAccessError.message.includes(
        "operational_access_profile_required",
      )
    ) {
      return {
        status: "error",
        message:
          "Conclua a análise/configuração visual desta câmera antes de ativar abertura e fechamento.",
      };
    }

    return {
      status: "error",
      message:
        "Não foi possível configurar a detecção de abertura e fechamento.",
    };
  }

  // O plano comercial não vem do formulário. Isso impede que a
  // configuração técnica contorne a assinatura da câmera.
  const plan = normalizeAnalysisPlan(
    (camera as { analysis_plan_code?: unknown }).analysis_plan_code,
  );
  const settings = CAMERA_ANALYSIS_PLANS[plan];

  // Câmeras escolhidas como referência de acesso usam um preset mais
  // sensível para captar persianas/portões lentos, sem mudar o Agent.
  const motionStartThreshold = operationalAccessEnabled
    ? Math.min(settings.motionStartThreshold, 0.5)
    : settings.motionStartThreshold;
  const motionContinueThreshold = operationalAccessEnabled
    ? Math.min(settings.motionContinueThreshold, 0.25)
    : settings.motionContinueThreshold;

  const { error } = await supabase
    .from("cameras")
    .update({
      capture_interval_seconds:
        settings.captureIntervalSeconds,
      consolidation_interval_seconds:
        settings.consolidationIntervalSeconds,
      motion_start_threshold:
        motionStartThreshold,
      motion_continue_threshold:
        motionContinueThreshold,
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
      operational_access_enabled: operationalAccessEnabled,
      operational_opening_time:
        operationalAccessEnabled ? operationalOpeningTime : null,
      operational_closing_time:
        operationalAccessEnabled ? operationalClosingTime : null,
      operational_motion_start_threshold:
        operationalAccessEnabled ? motionStartThreshold : null,
      operational_motion_continue_threshold:
        operationalAccessEnabled ? motionContinueThreshold : null,
    },
  });

  revalidatePath(`/dashboard/cameras/${cameraId}`);
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard");

  return {
    status: "success",
    message: operationalAccessEnabled
      ? "Configuração salva. Esta câmera agora é a referência de abertura e fechamento do local e permanece monitorando 24 horas."
      : "Configuração salva. O Agent sincronizará em até cinco minutos ou após reiniciar.",
  };
}
