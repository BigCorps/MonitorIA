import { createClient } from "@/src/lib/supabase/server";

export type RunningTrialCameraState = {
  running: boolean;
  trialId: string | null;
  cameraIds: string[];
};

/**
 * Retorna somente as câmeras que estão efetivamente capturando no período
 * de teste atual.
 *
 * - self_service: usa a camera_id do trial_run.
 * - sales_assisted: usa as câmeras do trial_run_cameras que já iniciaram
 *   captura e ainda não a concluíram.
 *
 * Fora da janela de captura, `running` é false para não apresentar uma câmera
 * como "ativa no teste" quando o período já terminou.
 */
export async function getRunningTrialCameraState(
  organizationId: string,
): Promise<RunningTrialCameraState> {
  const supabase = await createClient();

  const { data: trial, error } = await supabase
    .from("trial_runs")
    .select(
      "id,camera_id,trial_mode,status,capture_started_at,capture_ends_at,capture_completed_at,created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Falha ao carregar estado do teste para as câmeras:", {
      organizationId,
      code: error.code,
      message: error.message,
    });

    return {
      running: false,
      trialId: null,
      cameraIds: [],
    };
  }

  if (!trial) {
    return {
      running: false,
      trialId: null,
      cameraIds: [],
    };
  }

  const startedAt = trial.capture_started_at
    ? new Date(String(trial.capture_started_at)).getTime()
    : Number.NaN;
  const endsAt = trial.capture_ends_at
    ? new Date(String(trial.capture_ends_at)).getTime()
    : Number.NaN;
  const now = Date.now();

  const running =
    String(trial.status) === "running" &&
    Number.isFinite(startedAt) &&
    Number.isFinite(endsAt) &&
    startedAt <= now &&
    now < endsAt &&
    !trial.capture_completed_at;

  if (!running) {
    return {
      running: false,
      trialId: String(trial.id),
      cameraIds: [],
    };
  }

  if (String(trial.trial_mode) !== "sales_assisted") {
    return {
      running: true,
      trialId: String(trial.id),
      cameraIds: trial.camera_id ? [String(trial.camera_id)] : [],
    };
  }

  const { data: rows, error: camerasError } = await supabase
    .from("trial_run_cameras")
    .select(
      "camera_id,status,capture_started_at,capture_ends_at,capture_completed_at",
    )
    .eq("organization_id", organizationId)
    .eq("trial_run_id", String(trial.id));

  if (camerasError) {
    console.error("Falha ao carregar câmeras do teste assistido:", {
      organizationId,
      trialId: String(trial.id),
      code: camerasError.code,
      message: camerasError.message,
    });

    return {
      running: true,
      trialId: String(trial.id),
      cameraIds: [],
    };
  }

  const cameraIds = (rows ?? []).flatMap((row: any) => {
    const rowStartedAt = row.capture_started_at
      ? new Date(String(row.capture_started_at)).getTime()
      : Number.NaN;
    const rowEndsAt = row.capture_ends_at
      ? new Date(String(row.capture_ends_at)).getTime()
      : Number.NaN;

    const rowRunning =
      String(row.status) === "running" &&
      Number.isFinite(rowStartedAt) &&
      Number.isFinite(rowEndsAt) &&
      rowStartedAt <= now &&
      now < rowEndsAt &&
      !row.capture_completed_at;

    return rowRunning && row.camera_id ? [String(row.camera_id)] : [];
  });

  return {
    running: true,
    trialId: String(trial.id),
    cameraIds,
  };
}
