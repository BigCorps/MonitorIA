import { createClient } from "@/src/lib/supabase/server";

export type CameraHealthCamera = {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  enabled: boolean;
  intervalSeconds: number;
  healthStatus: string;
  lastObservedAt: string | null;
  baselineStatus: string;
  baselineId: string | null;
  proposedBaselineId: string | null;
  latestObservation: {
    capturedAt: string;
    brightnessMean: number;
    contrastStddev: number;
    edgeDensity: number;
    blurScore: number;
    darkPixelRatio: number;
    brightPixelRatio: number;
    baselineDistance: number | null;
    issueCodes: string[];
  } | null;
  activeIncidents: number;
};

export type CameraHealthIncident = {
  id: string;
  cameraId: string;
  cameraName: string;
  siteName: string;
  incidentType: string;
  status: string;
  severity: string;
  title: string;
  summary: string;
  reasons: string[];
  confidence: number;
  consecutiveCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
};

export type CameraHealthBaseline = {
  id: string;
  cameraId: string;
  cameraName: string;
  status: string;
  source: string;
  version: number;
  capturedAt: string;
  sampleCount: number;
  distinctDays: number;
  confidence: number;
  notes: string;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

export async function getCameraHealthOverview(
  organizationId: string,
  input: { cameraId?: string | null; incidentStatus?: string | null } = {},
) {
  const supabase = await createClient();

  let cameraQuery = supabase
    .from("cameras")
    .select("id,name,site_id,health_intelligence_enabled,health_observation_interval_seconds,health_status,health_last_observed_at,site:sites(name)")
    .eq("organization_id", organizationId)
    .order("name");
  if (input.cameraId) cameraQuery = cameraQuery.eq("id", input.cameraId);

  let incidentQuery = supabase
    .from("camera_health_incidents")
    .select("id,camera_id,incident_type,status,severity,title,summary,reasons,confidence,consecutive_count,first_observed_at,last_observed_at,camera:cameras(name),site:sites(name)")
    .eq("organization_id", organizationId)
    .order("last_observed_at", { ascending: false })
    .limit(100);
  if (input.cameraId) incidentQuery = incidentQuery.eq("camera_id", input.cameraId);
  if (input.incidentStatus) incidentQuery = incidentQuery.eq("status", input.incidentStatus);
  else incidentQuery = incidentQuery.in("status", ["observing", "open"]);

  let baselineQuery = supabase
    .from("camera_health_baselines")
    .select("id,camera_id,status,source,version,captured_at,sample_count,distinct_days,confidence,notes,camera:cameras(name)")
    .eq("organization_id", organizationId)
    .in("status", ["active", "proposed"])
    .order("created_at", { ascending: false });
  if (input.cameraId) baselineQuery = baselineQuery.eq("camera_id", input.cameraId);

  const [cameraResult, incidentResult, baselineResult] = await Promise.all([
    cameraQuery, incidentQuery, baselineQuery,
  ]);

  if (cameraResult.error) throw new Error(cameraResult.error.message);
  if (incidentResult.error) throw new Error(incidentResult.error.message);
  if (baselineResult.error) throw new Error(baselineResult.error.message);

  const cameraIds = (cameraResult.data ?? []).map((row: any) => String(row.id));
  const latestByCamera = new Map<string, any>();
  if (cameraIds.length) {
    const { data, error } = await supabase
      .from("camera_health_observations")
      .select("camera_id,captured_at,brightness_mean,contrast_stddev,edge_density,blur_score,dark_pixel_ratio,bright_pixel_ratio,baseline_distance,issue_codes")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .order("captured_at", { ascending: false });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = String((row as any).camera_id);
      if (!latestByCamera.has(id)) latestByCamera.set(id, row);
    }
  }

  const baselines: CameraHealthBaseline[] = (baselineResult.data ?? []).map((row: any) => ({
    id: String(row.id), cameraId: String(row.camera_id),
    cameraName: String(relationOne(row.camera)?.name ?? "Câmera"),
    status: String(row.status), source: String(row.source), version: Number(row.version),
    capturedAt: String(row.captured_at), sampleCount: Number(row.sample_count),
    distinctDays: Number(row.distinct_days), confidence: Number(row.confidence),
    notes: String(row.notes ?? ""),
  }));
  const activeByCamera = new Map(baselines.filter((b) => b.status === "active").map((b) => [b.cameraId, b]));
  const proposedByCamera = new Map(baselines.filter((b) => b.status === "proposed").map((b) => [b.cameraId, b]));

  const incidents: CameraHealthIncident[] = (incidentResult.data ?? []).map((row: any) => ({
    id: String(row.id), cameraId: String(row.camera_id),
    cameraName: String(relationOne(row.camera)?.name ?? "Câmera"),
    siteName: String(relationOne(row.site)?.name ?? "Local"),
    incidentType: String(row.incident_type), status: String(row.status),
    severity: String(row.severity), title: String(row.title), summary: String(row.summary),
    reasons: strings(row.reasons), confidence: Number(row.confidence),
    consecutiveCount: Number(row.consecutive_count),
    firstObservedAt: String(row.first_observed_at), lastObservedAt: String(row.last_observed_at),
  }));

  const cameras: CameraHealthCamera[] = (cameraResult.data ?? []).map((row: any) => {
    const id = String(row.id); const latest = latestByCamera.get(id); const site = relationOne(row.site);
    return {
      id, name: String(row.name), siteId: String(row.site_id), siteName: String(site?.name ?? "Local"),
      enabled: Boolean(row.health_intelligence_enabled),
      intervalSeconds: Number(row.health_observation_interval_seconds ?? 300),
      healthStatus: String(row.health_status ?? "unknown"),
      lastObservedAt: row.health_last_observed_at ? String(row.health_last_observed_at) : null,
      baselineStatus: activeByCamera.has(id) ? "active" : proposedByCamera.has(id) ? "proposed" : "missing",
      baselineId: activeByCamera.get(id)?.id ?? null,
      proposedBaselineId: proposedByCamera.get(id)?.id ?? null,
      latestObservation: latest ? {
        capturedAt: String(latest.captured_at), brightnessMean: Number(latest.brightness_mean),
        contrastStddev: Number(latest.contrast_stddev), edgeDensity: Number(latest.edge_density),
        blurScore: Number(latest.blur_score), darkPixelRatio: Number(latest.dark_pixel_ratio),
        brightPixelRatio: Number(latest.bright_pixel_ratio),
        baselineDistance: latest.baseline_distance === null ? null : Number(latest.baseline_distance),
        issueCodes: strings(latest.issue_codes),
      } : null,
      activeIncidents: incidents.filter((incident) => incident.cameraId === id).length,
    };
  });

  return {
    cameras, incidents, baselines,
    summary: {
      enabled: cameras.filter((camera) => camera.enabled).length,
      healthy: cameras.filter((camera) => camera.healthStatus === "healthy").length,
      learning: cameras.filter((camera) => camera.healthStatus === "learning").length,
      degraded: cameras.filter((camera) => camera.healthStatus === "degraded").length,
      critical: cameras.filter((camera) => ["critical", "offline"].includes(camera.healthStatus)).length,
      activeIncidents: incidents.length,
      proposedBaselines: baselines.filter((baseline) => baseline.status === "proposed").length,
    },
  };
}
