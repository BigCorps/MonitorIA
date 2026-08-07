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

function mapAlert(row: any): OperationalAlert {
  const camera = relationOne<{ name?: string }>(row.camera);
  const agent = relationOne<{ name?: string }>(row.agent);
  const site = relationOne<{ name?: string }>(row.site);
  return {
    id: String(row.id),
    code: String(row.alert_code),
    severity: String(row.severity) as OperationalAlert["severity"],
    status: String(row.status) as OperationalAlert["status"],
    title: String(row.title),
    summary: String(row.summary),
    cameraName: camera?.name ? String(camera.name) : null,
    agentName: agent?.name ? String(agent.name) : null,
    siteName: site?.name ? String(site.name) : null,
    condition: objectValue(row.condition),
    evidence: objectValue(row.evidence),
    firstObservedAt: String(row.first_observed_at),
    lastObservedAt: String(row.last_observed_at),
    occurrenceCount: Number(row.occurrence_count ?? 1),
  };
}

const ALERT_SELECT = `
  id,alert_code,severity,status,title,summary,condition,evidence,
  first_observed_at,last_observed_at,occurrence_count,
  camera:cameras(name),agent:agents(name),site:sites(name)
`;

export async function getOperationalAlertOverview(
  organizationId: string,
): Promise<OperationalAlertOverview> {
  const supabase = await createClient();
  const [activeResult, resolvedResult] = await Promise.all([
    supabase
      .from("operational_alerts")
      .select(ALERT_SELECT)
      .eq("organization_id", organizationId)
      .in("status", ["open", "acknowledged"])
      .order("severity", { ascending: true })
      .order("last_observed_at", { ascending: false })
      .limit(100),
    supabase
      .from("operational_alerts")
      .select(ALERT_SELECT)
      .eq("organization_id", organizationId)
      .eq("status", "resolved")
      .order("resolved_at", { ascending: false })
      .limit(20),
  ]);

  if (activeResult.error) {
    throw new Error(`operational_alerts_unavailable:${activeResult.error.message}`);
  }
  if (resolvedResult.error) {
    throw new Error(`resolved_alerts_unavailable:${resolvedResult.error.message}`);
  }

  const active = (activeResult.data ?? []).map(mapAlert);
  return {
    active,
    recentResolved: (resolvedResult.data ?? []).map(mapAlert),
    counts: {
      critical: active.filter((alert) => alert.severity === "critical").length,
      warning: active.filter((alert) => alert.severity === "warning").length,
      acknowledged: active.filter((alert) => alert.status === "acknowledged").length,
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

  if (error) throw new Error(`cross_camera_journeys_unavailable:${error.message}`);

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

