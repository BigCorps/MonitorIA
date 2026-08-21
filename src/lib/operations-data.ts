import type {
  CrossCameraJourney,
  OperationalAlert,
  OperationalAlertOverview,
} from "@/src/contracts/operations";
import { createClient } from "@/src/lib/supabase/server";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapAlert(
  row: any,
  source: OperationalAlert["source"],
): OperationalAlert {
  const camera = relationOne<{ id?: string; name?: string }>(row.camera);
  const agent = relationOne<{ id?: string; name?: string }>(row.agent);
  const site = relationOne<{ name?: string; timezone?: string }>(row.site);

  return {
    id: String(row.id),
    source,
    code: String(row.alert_code),
    severity: String(row.severity) as OperationalAlert["severity"],
    status: String(row.status) as OperationalAlert["status"],
    title: String(row.title ?? "Alerta"),
    summary: String(row.summary ?? "Situação que precisa de verificação."),
    cameraId: camera?.id ? String(camera.id) : null,
    cameraName: camera?.name ? String(camera.name) : null,
    agentId: agent?.id ? String(agent.id) : null,
    agentName: agent?.name ? String(agent.name) : null,
    siteName: site?.name ? String(site.name) : null,
    siteTimezone: site?.timezone ? String(site.timezone) : null,
    condition: objectValue(row.condition),
    evidence: objectValue(row.evidence),
    firstObservedAt: String(row.first_observed_at),
    lastObservedAt: String(row.last_observed_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    occurrenceCount: Number(row.occurrence_count ?? 1),
    confidence:
      row.confidence === null || row.confidence === undefined
        ? null
        : Number(row.confidence),
    reason: row.reason ? String(row.reason) : null,
    recommendation: row.recommendation
      ? String(row.recommendation)
      : null,
    evidenceEventIds: Array.isArray(row.evidence_event_ids)
      ? row.evidence_event_ids.map(String)
      : [],
    sourceEntityType: row.source_entity_type
      ? String(row.source_entity_type)
      : null,
    sourceEntityId: row.source_entity_id
      ? String(row.source_entity_id)
      : null,
  };
}

const ALERT_SELECT = `
  id,alert_code,severity,status,title,summary,condition,evidence,
  first_observed_at,last_observed_at,resolved_at,occurrence_count,
  camera:cameras(id,name),agent:agents(id,name),site:sites(name,timezone)
`;

const INTELLIGENT_ALERT_SELECT = `
  id,alert_code,severity,status,title,summary,condition,
  first_observed_at,last_observed_at,resolved_at,occurrence_count,
  confidence,reason,recommendation,evidence_event_ids,
  source_entity_type,source_entity_id,
  camera:cameras(id,name),site:sites(name,timezone)
`;

export async function getOperationalAlertOverview(
  organizationId: string,
): Promise<OperationalAlertOverview> {
  const supabase = await createClient();

  const [activeResult, resolvedResult, intelligentActive, intelligentResolved] =
    await Promise.all([
      supabase
        .from("operational_alerts")
        .select(ALERT_SELECT)
        .eq("organization_id", organizationId)
        .in("status", ["open", "acknowledged"])
        .order("last_observed_at", { ascending: false })
        .limit(100),
      supabase
        .from("operational_alerts")
        .select(ALERT_SELECT)
        .eq("organization_id", organizationId)
        .eq("status", "resolved")
        .order("resolved_at", { ascending: false })
        .limit(30),
      supabase
        .from("intelligent_alerts")
        .select(INTELLIGENT_ALERT_SELECT)
        .eq("organization_id", organizationId)
        .in("status", ["open", "acknowledged"])
        .order("last_observed_at", { ascending: false })
        .limit(100),
      supabase
        .from("intelligent_alerts")
        .select(INTELLIGENT_ALERT_SELECT)
        .eq("organization_id", organizationId)
        .eq("status", "resolved")
        .order("resolved_at", { ascending: false })
        .limit(30),
    ]);

  if (activeResult.error) {
    throw new Error(
      `operational_alerts_unavailable:${activeResult.error.message}`,
    );
  }
  if (resolvedResult.error) {
    throw new Error(
      `resolved_alerts_unavailable:${resolvedResult.error.message}`,
    );
  }
  if (intelligentActive.error) {
    throw new Error(
      `intelligent_alerts_unavailable:${intelligentActive.error.message}`,
    );
  }
  if (intelligentResolved.error) {
    throw new Error(
      `resolved_intelligent_alerts_unavailable:${intelligentResolved.error.message}`,
    );
  }

  const severityOrder = { critical: 0, warning: 1, info: 2 } as const;
  const active = [
    ...(activeResult.data ?? []).map((row) => mapAlert(row, "operational")),
    ...(intelligentActive.data ?? []).map((row) => mapAlert(row, "intelligent")),
  ].sort(
    (left, right) =>
      (severityOrder[left.severity] ?? 3) -
        (severityOrder[right.severity] ?? 3) ||
      new Date(right.lastObservedAt).getTime() -
        new Date(left.lastObservedAt).getTime(),
  );

  const recentResolved = [
    ...(resolvedResult.data ?? []).map((row) => mapAlert(row, "operational")),
    ...(intelligentResolved.data ?? []).map((row) =>
      mapAlert(row, "intelligent"),
    ),
  ]
    .sort(
      (left, right) =>
        new Date(right.resolvedAt ?? right.lastObservedAt).getTime() -
        new Date(left.resolvedAt ?? left.lastObservedAt).getTime(),
    )
    .slice(0, 30);

  return {
    active,
    recentResolved,
    counts: {
      total: active.length,
      critical: active.filter((alert) => alert.severity === "critical").length,
      warning: active.filter((alert) => alert.severity === "warning").length,
      acknowledged: active.filter((alert) => alert.status === "acknowledged")
        .length,
    },
  };
}

export async function getCrossCameraJourneys(
  organizationId: string,
  limit = 100,
): Promise<CrossCameraJourney[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cross_camera_journeys")
    .select(`
      id,subject_type,from_event_id,to_event_id,observed_from,observed_to,
      travel_seconds,probable_direction,confidence,summary,competing_hypotheses,
      site:sites(name),from_camera:cameras!cross_camera_journeys_from_camera_id_fkey(name),
      to_camera:cameras!cross_camera_journeys_to_camera_id_fkey(name)
    `)
    .eq("organization_id", organizationId)
    .gt("expires_at", new Date().toISOString())
    .order("observed_to", { ascending: false })
    .limit(Math.max(1, Math.min(limit, 250)));

  if (error) {
    throw new Error(`cross_camera_journeys_unavailable:${error.message}`);
  }

  return (data ?? []).map((row: any) => {
    const site = relationOne<{ name?: string }>(row.site);
    const fromCamera = relationOne<{ name?: string }>(row.from_camera);
    const toCamera = relationOne<{ name?: string }>(row.to_camera);

    return {
      id: String(row.id),
      subjectType: String(row.subject_type) as CrossCameraJourney["subjectType"],
      siteName: String(site?.name ?? "Local"),
      fromCameraName: String(fromCamera?.name ?? "Câmera"),
      toCameraName: String(toCamera?.name ?? "Câmera"),
      fromEventId: String(row.from_event_id),
      toEventId: String(row.to_event_id),
      observedFrom: String(row.observed_from),
      observedTo: String(row.observed_to),
      travelSeconds: Number(row.travel_seconds),
      probableDirection: String(row.probable_direction),
      confidence: Number(row.confidence),
      summary: String(row.summary),
      competingHypotheses: Array.isArray(row.competing_hypotheses)
        ? row.competing_hypotheses
        : [],
    };
  });
}
