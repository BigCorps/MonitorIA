import { createAdminClient } from "@/src/lib/supabase/admin";
import { effectiveTrialStatus } from "@/src/trial/status";
import type { TrialStatus } from "@/src/trial/types";

export type SalesTrialResultEvent = {
  id: string;
  cameraId: string;
  cameraName: string;
  headline: string;
  summary: string;
  startedAt: string;
  type: string;
  typeLabel: string;
  confidence: number;
  requiresReview: boolean;
  isContinuation: boolean;
  clipReady: boolean;
};

export type SalesTrialResultCamera = {
  id: string;
  name: string;
  siteName: string;
  participantStatus: string;
  eventCount: number;
  clipCount: number;
};

export type SalesTrialResults = {
  trialId: string;
  organizationId: string;
  organizationName: string;
  status: string;
  durationMinutes: number;
  maxCameras: number;
  captureStartedAt: string | null;
  captureEndsAt: string | null;
  explorationEndsAt: string | null;
  purgeAfter: string | null;
  cameraCount: number;
  eventCount: number;
  clipCount: number;
  reviewCount: number;
  continuationCount: number;
  cameras: SalesTrialResultCamera[];
  topEventTypes: Array<{
    type: string;
    label: string;
    count: number;
  }>;
  recentEvents: SalesTrialResultEvent[];
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  no_relevant_change: "Sem mudança relevante",
  person_present: "Pessoa detectada",
  person_entered: "Pessoa entrou",
  person_exited: "Pessoa saiu",
  vehicle_present: "Veículo detectado",
  vehicle_entered: "Veículo entrou",
  vehicle_exited: "Veículo saiu",
  vehicle_stopped: "Veículo parado",
  delivery_arrived: "Entrega chegou",
  delivery_completed: "Entrega concluída",
  service_started: "Atendimento iniciado",
  service_continued: "Atendimento em andamento",
  service_completed: "Atendimento concluído",
  opening_activity: "Atividade de abertura",
  closing_activity: "Atividade de fechamento",
  object_left: "Objeto deixado",
  object_removed: "Objeto retirado",
  unusual_activity: "Atividade incomum",
};

export function salesTrialEventTypeLabel(type: string) {
  const normalized = type.trim().toLowerCase();
  if (EVENT_TYPE_LABELS[normalized]) {
    return EVENT_TYPE_LABELS[normalized];
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Acontecimento";
}

function stringValue(value: unknown) {
  return value == null ? null : String(value);
}

async function loadSalesTrialResultsByTrialId(
  trialId: string,
  expectedOrganizationId?: string,
): Promise<SalesTrialResults | null> {
  const admin = createAdminClient();

  let trialQuery = admin
    .from("trial_runs")
    .select(
      "id,organization_id,status,trial_mode,duration_minutes,max_cameras,capture_started_at,capture_ends_at,exploration_ends_at,purge_after",
    )
    .eq("id", trialId);

  if (expectedOrganizationId) {
    trialQuery = trialQuery.eq("organization_id", expectedOrganizationId);
  }

  const { data: trial, error: trialError } = await trialQuery.maybeSingle();
  if (trialError) {
    throw new Error(`sales_trial_result_unavailable:${trialError.message}`);
  }

  if (!trial || String(trial.trial_mode) !== "sales_assisted") {
    return null;
  }

  const organizationId = String(trial.organization_id);

  const [organizationResult, participantsResult, eventCountResult, reviewCountResult, continuationCountResult, eventsResult, clipsResult, clipCountResult] =
    await Promise.all([
      admin
        .from("organizations")
        .select("id,name")
        .eq("id", organizationId)
        .single(),
      admin
        .from("trial_run_cameras")
        .select("camera_id,status")
        .eq("trial_run_id", trialId)
        .neq("status", "removed")
        .order("created_at", { ascending: true }),
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .is("deleted_at", null),
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .eq("requires_review", true)
        .is("deleted_at", null),
      admin
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .eq("is_continuation", true)
        .is("deleted_at", null),
      admin
        .from("events")
        .select(
          "id,camera_id,headline,summary,started_at,primary_event_type,confidence,requires_review,is_continuation",
        )
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(1000),
      admin
        .from("storage_assets")
        .select("id,event_id,camera_id")
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .eq("kind", "preserved_clip")
        .eq("status", "ready")
        .is("deleted_at", null)
        .limit(1000),
      admin
        .from("storage_assets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trialId)
        .eq("kind", "preserved_clip")
        .eq("status", "ready")
        .is("deleted_at", null),
    ]);

  const firstError = [
    organizationResult.error,
    participantsResult.error,
    eventCountResult.error,
    reviewCountResult.error,
    continuationCountResult.error,
    eventsResult.error,
    clipsResult.error,
    clipCountResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(`sales_trial_result_query_failed:${firstError.message}`);
  }

const organization = organizationResult.data;

if (!organization) {
  throw new Error("sales_trial_result_organization_missing");
}
  
  const participantRows = participantsResult.data ?? [];
  const cameraIds = participantRows.map((row) => String(row.camera_id));

  const cameraResult = cameraIds.length
    ? await admin
        .from("cameras")
        .select("id,name,site_id")
        .eq("organization_id", organizationId)
        .in("id", cameraIds)
    : { data: [], error: null };

  if (cameraResult.error) {
    throw new Error(`sales_trial_result_cameras_failed:${cameraResult.error.message}`);
  }

  const siteIds = [
    ...new Set(
      (cameraResult.data ?? [])
        .map((row) => (row.site_id ? String(row.site_id) : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const siteResult = siteIds.length
    ? await admin
        .from("sites")
        .select("id,name")
        .eq("organization_id", organizationId)
        .in("id", siteIds)
    : { data: [], error: null };

  if (siteResult.error) {
    throw new Error(`sales_trial_result_sites_failed:${siteResult.error.message}`);
  }

  const siteNames = new Map(
    (siteResult.data ?? []).map((row) => [String(row.id), String(row.name)]),
  );
  const cameraNames = new Map(
    (cameraResult.data ?? []).map((row) => [String(row.id), String(row.name)]),
  );
  const cameraSites = new Map(
    (cameraResult.data ?? []).map((row) => [
      String(row.id),
      siteNames.get(String(row.site_id)) ?? "Local",
    ]),
  );

  const clipEventIds = new Set(
    (clipsResult.data ?? [])
      .map((row) => stringValue(row.event_id))
      .filter((value): value is string => Boolean(value)),
  );

  const eventRows = eventsResult.data ?? [];
  const eventCounts = new Map<string, number>();
  const clipCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();

  for (const row of eventRows) {
    const cameraId = String(row.camera_id);
    eventCounts.set(cameraId, (eventCounts.get(cameraId) ?? 0) + 1);
    const type = String(row.primary_event_type ?? "event");
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1);
  }

  for (const row of clipsResult.data ?? []) {
    const cameraId = String(row.camera_id);
    clipCounts.set(cameraId, (clipCounts.get(cameraId) ?? 0) + 1);
  }

  const cameras: SalesTrialResultCamera[] = participantRows.map((participant) => {
    const cameraId = String(participant.camera_id);
    return {
      id: cameraId,
      name: cameraNames.get(cameraId) ?? "Câmera",
      siteName: cameraSites.get(cameraId) ?? "Local",
      participantStatus: String(participant.status ?? "selected"),
      eventCount: eventCounts.get(cameraId) ?? 0,
      clipCount: clipCounts.get(cameraId) ?? 0,
    };
  });

  const topEventTypes = [...typeCounts.entries()]
    .filter(([type]) => type !== "no_relevant_change")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type, count]) => ({
      type,
      label: salesTrialEventTypeLabel(type),
      count,
    }));

  const recentEvents: SalesTrialResultEvent[] = eventRows
    .slice(0, 12)
    .map((row) => {
      const id = String(row.id);
      const cameraId = String(row.camera_id);
      const type = String(row.primary_event_type ?? "event");
      return {
        id,
        cameraId,
        cameraName: cameraNames.get(cameraId) ?? "Câmera",
        headline: String(row.headline ?? salesTrialEventTypeLabel(type)),
        summary: String(row.summary ?? ""),
        startedAt: String(row.started_at),
        type,
        typeLabel: salesTrialEventTypeLabel(type),
        confidence: Number(row.confidence ?? 0),
        requiresReview: Boolean(row.requires_review),
        isContinuation: Boolean(row.is_continuation),
        clipReady: clipEventIds.has(id),
      };
    });

  const effectiveStatus = effectiveTrialStatus({
    status: String(trial.status) as TrialStatus,
    captureEndsAt: stringValue(trial.capture_ends_at),
    explorationEndsAt: stringValue(trial.exploration_ends_at),
  });

  return {
    trialId,
    organizationId,
    organizationName: String(organization.name),
    status: effectiveStatus,
    durationMinutes: Number(trial.duration_minutes ?? 60),
    maxCameras: Number(trial.max_cameras ?? 6),
    captureStartedAt: stringValue(trial.capture_started_at),
    captureEndsAt: stringValue(trial.capture_ends_at),
    explorationEndsAt: stringValue(trial.exploration_ends_at),
    purgeAfter: stringValue(trial.purge_after),
    cameraCount: cameras.length,
    eventCount: eventCountResult.count ?? 0,
    clipCount: clipCountResult.count ?? 0,
    reviewCount: reviewCountResult.count ?? 0,
    continuationCount: continuationCountResult.count ?? 0,
    cameras,
    topEventTypes,
    recentEvents,
  };
}

export async function getSalesTrialResultsForOrganization(
  organizationId: string,
): Promise<SalesTrialResults | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("trial_mode", "sales_assisted")
    .maybeSingle();

  if (error) {
    throw new Error(`sales_trial_result_trial_failed:${error.message}`);
  }

  if (!data) return null;
  return loadSalesTrialResultsByTrialId(String(data.id), organizationId);
}

export async function getSalesTrialResultsById(trialId: string) {
  return loadSalesTrialResultsByTrialId(trialId);
}
