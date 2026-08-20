"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

function timeToMinute(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
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

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) throw new Error("Organização não encontrada.");
  if (!["owner", "admin"].includes(organization.role)) {
    throw new Error("Apenas owner ou admin pode configurar as rotinas.");
  }

  return {
    organization,
    supabase: await createClient(),
  };
}

export async function saveRoutineScheduleAction(formData: FormData) {
  const { organization, supabase } = await context();

  const cameraId = String(formData.get("camera_id") ?? "");
  const workingDays = [
    ...new Set(
      formData
        .getAll("working_days")
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isInteger(value) &&
            value >= 0 &&
            value <= 6,
        ),
    ),
  ].sort((a, b) => a - b);

  const openMinute = timeToMinute(String(formData.get("open_time") ?? ""));
  const closeMinute = timeToMinute(String(formData.get("close_time") ?? ""));
  const sensitivity = String(formData.get("sensitivity") ?? "balanced");

  if (!["conservative", "balanced", "sensitive"].includes(sensitivity)) {
    throw new Error("Tolerância inválida.");
  }

  if (workingDays.length && (openMinute === null || closeMinute === null)) {
    throw new Error("Informe os horários de abertura e fechamento.");
  }

  let exceptions: Array<{
    date: string;
    closed: boolean;
    openMinute: number | null;
    closeMinute: number | null;
  }> = [];

  try {
    const parsed = JSON.parse(String(formData.get("exceptions_json") ?? "[]"));
    if (!Array.isArray(parsed) || parsed.length > 40) throw new Error("invalid");

    const normalized = parsed.flatMap((item) => {
      if (!item || typeof item !== "object" || !validDate(item.date)) return [];

      const closed = item.closed === true;
      const exceptionOpen = closed
        ? null
        : Number.isInteger(item.openMinute)
          ? Number(item.openMinute)
          : null;
      const exceptionClose = closed
        ? null
        : Number.isInteger(item.closeMinute)
          ? Number(item.closeMinute)
          : null;

      if (
        !closed &&
        (
          exceptionOpen === null ||
          exceptionClose === null ||
          exceptionOpen < 0 ||
          exceptionOpen > 1439 ||
          exceptionClose < 0 ||
          exceptionClose > 1439
        )
      ) {
        return [];
      }

      return [{
        date: item.date,
        closed,
        openMinute: exceptionOpen,
        closeMinute: exceptionClose,
      }];
    });

    const byDate = new Map(normalized.map((item) => [item.date, item]));
    exceptions = [...byDate.values()].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  } catch {
    throw new Error("Datas especiais inválidas.");
  }

  const { error } = await supabase.rpc("save_camera_routine_schedule_v1", {
    p_camera_id: cameraId,
    p_working_days: workingDays,
    p_open_minute: openMinute,
    p_close_minute: closeMinute,
    p_sensitivity: sensitivity,
    p_exceptions: exceptions,
  });

  if (error) {
    console.error("Falha ao salvar rotina:", {
      organizationId: organization.id,
      cameraId,
      message: error.message,
    });
    throw new Error("Não foi possível salvar os horários informados.");
  }

  revalidatePath("/dashboard/routines");
}

export async function clearRoutineScheduleAction(formData: FormData) {
  const { supabase } = await context();
  const cameraId = String(formData.get("camera_id") ?? "");

  const { error } = await supabase.rpc("clear_camera_routine_schedule_v1", {
    p_camera_id: cameraId,
  });

  if (error) throw new Error("Não foi possível remover os horários informados.");

  revalidatePath("/dashboard/routines");
}
