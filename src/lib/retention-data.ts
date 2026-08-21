import { createClient } from "@/src/lib/supabase/server";

export type CameraRetentionUsage = {
  cameraId: string;
  cameraName: string;
  timezone: string;
  accessSource: string;
  planCode: string;
  metadataRetentionDays: number;
  longTermKeyframes: number;
  temporaryFrameDays: number;
  clipEnabled: boolean;
  clipRetentionDays: number | null;
  retainedEvents: number;
  longTermAssets: number;
  temporaryAssets: number;
  clipAssets: number;
  longTermBytes: number;
  temporaryBytes: number;
  clipBytes: number;
  totalBytes: number;
  nextTemporaryExpiry: string | null;
  oldestRetainedAt: string | null;
  newestRetainedAt: string | null;
  eventsWithKeyframeMismatch: number;
};

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getOrganizationRetentionUsage(
  organizationId: string,
): Promise<CameraRetentionUsage[]> {
  const supabase = await createClient();

  const [usageResult, cameraResult] = await Promise.all([
    supabase
      .from("camera_retention_usage")
      .select("*")
      .eq("organization_id", organizationId)
      .order("camera_name", { ascending: true }),
    supabase
      .from("cameras")
      .select("id,site:sites(timezone)")
      .eq("organization_id", organizationId),
  ]);

  if (usageResult.error) {
    console.error("Falha ao carregar retenção:", usageResult.error.message);
    return [];
  }

  if (cameraResult.error) {
    console.error(
      "Falha ao carregar fuso horário das câmeras:",
      cameraResult.error.message,
    );
  }

  const timezoneByCamera = new Map<string, string>();

  for (const row of cameraResult.data ?? []) {
    const site = relationOne<{ timezone?: string }>((row as any).site);
    timezoneByCamera.set(
      String((row as any).id),
      String(site?.timezone ?? "America/Sao_Paulo"),
    );
  }

  return (usageResult.data ?? []).map((row: any) => ({
    cameraId: String(row.camera_id),
    cameraName: String(row.camera_name),
    timezone:
      timezoneByCamera.get(String(row.camera_id)) ?? "America/Sao_Paulo",
    accessSource: String(row.access_source ?? "blocked"),
    planCode: String(row.plan_code ?? "basic"),
    metadataRetentionDays: numberValue(row.metadata_retention_days),
    longTermKeyframes: numberValue(row.long_term_keyframes),
    temporaryFrameDays: numberValue(row.temporary_frame_days),
    clipEnabled: Boolean(row.clip_enabled),
    clipRetentionDays:
      row.clip_retention_days === null
        ? null
        : numberValue(row.clip_retention_days),
    retainedEvents: numberValue(row.retained_events),
    longTermAssets: numberValue(row.long_term_assets),
    temporaryAssets: numberValue(row.temporary_assets),
    clipAssets: numberValue(row.clip_assets),
    longTermBytes: numberValue(row.long_term_bytes),
    temporaryBytes: numberValue(row.temporary_bytes),
    clipBytes: numberValue(row.clip_bytes),
    totalBytes: numberValue(row.total_bytes),
    nextTemporaryExpiry: row.next_temporary_expiry
      ? String(row.next_temporary_expiry)
      : null,
    oldestRetainedAt: row.oldest_retained_at
      ? String(row.oldest_retained_at)
      : null,
    newestRetainedAt: row.newest_retained_at
      ? String(row.newest_retained_at)
      : null,
    eventsWithKeyframeMismatch: numberValue(
      row.events_with_keyframe_mismatch,
    ),
  }));
}

export function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;

  return `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  }).format(value)} ${units[unitIndex]}`;
}

export function retentionPlanLabel(planCode: string) {
  if (planCode === "basic") return "Essencial";
  if (planCode === "standard") return "Atenta";
  if (planCode === "intensive") return "Detalhada";
  return "Sem plano";
}
