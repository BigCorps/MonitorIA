import { createClient } from "@/src/lib/supabase/server";

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  planCode: string;
  role: string;
};

export type SiteSummary = {
  id: string;
  name: string;
  timezone: string;
};

export type CameraSummary = {
  id: string;
  siteId: string;
  siteName: string;
  name: string;
  description: string;
  status: string;
  planCode: string;
  pairingStatus: string;
  pairedAt: string | null;
  monitoringGoals: string[];
  captureIntervalSeconds: number;
  consolidationIntervalSeconds: number;
  motionAdaptiveEnabled: boolean;
  motionOverlayMask: string;
  monitoringSchedule: Record<string, unknown>;
  createdAt: string;
};

export type EventSummary = {
  id: string;
  startedAt: string;
  summary: string;
  type: string;
  confidence: number;
  requiresReview: boolean;
};

function zonedStartIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
) {
  const localMidnightAsUtc = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0),
  );

  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(localMidnightAsUtc);

  const value = (type: string) =>
    Number(
      offsetParts.find((part) => part.type === type)?.value ?? 0,
    );

  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );

  const offsetMs =
    representedAsUtc - localMidnightAsUtc.getTime();

  return new Date(
    localMidnightAsUtc.getTime() - offsetMs,
  ).toISOString();
}

function localDateParts(timeZone: string) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: string) =>
    Number(
      parts.find((part) => part.type === type)?.value ?? 0,
    );

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
  };
}

function startOfLocalDayIso(timeZone: string) {
  const { year, month, day } = localDateParts(timeZone);
  return zonedStartIso(timeZone, year, month, day);
}

function startOfMonthIso(timeZone: string) {
  const { year, month } = localDateParts(timeZone);
  return zonedStartIso(timeZone, year, month, 1);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getCurrentOrganization(
  userId: string,
): Promise<OrganizationSummary | null> {
  const supabase = await createClient();

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select(
      "role, organization:organizations(id,name,slug,plan_code)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !memberships?.length) return null;

  const membership = memberships[0] as {
    role: string;
    organization:
      | {
          id: string;
          name: string;
          slug: string;
          plan_code: string;
        }
      | Array<{
          id: string;
          name: string;
          slug: string;
          plan_code: string;
        }>
      | null;
  };

  const organization = Array.isArray(membership.organization)
    ? membership.organization[0]
    : membership.organization;

  if (!organization) return null;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    planCode: organization.plan_code,
    role: membership.role,
  };
}

export async function getOrganizationSites(
  organizationId: string,
): Promise<SiteSummary[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("sites")
    .select("id,name,timezone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((site: any) => ({
    id: String(site.id),
    name: String(site.name),
    timezone: String(site.timezone),
  }));
}

export async function getDashboardData(
  organization: OrganizationSummary,
  site: SiteSummary,
) {
  const supabase = await createClient();
  const dayStart = startOfLocalDayIso(site.timezone);
  const monthStart = startOfMonthIso(site.timezone);

  const [
    cameraResult,
    agentResult,
    eventResult,
    usageResult,
    recentResult,
    retentionResult,
  ] = await Promise.all([
    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("site_id", site.id),
    supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("site_id", site.id)
      .eq("status", "online"),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("site_id", site.id)
      .gte("started_at", dayStart),
    supabase
      .from("usage_events")
      .select("estimated_cost_usd")
      .eq("organization_id", organization.id)
      .gte("created_at", monthStart),
    supabase
      .from("events")
      .select(
        "id,started_at,summary,primary_event_type,confidence,requires_review",
      )
      .eq("organization_id", organization.id)
      .eq("site_id", site.id)
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("retention_policies")
      .select(
        "temporary_frame_days,keyframe_days,metadata_days",
      )
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const usageUsd = (usageResult.data ?? []).reduce(
    (total: number, row: any) =>
      total + Number(row.estimated_cost_usd ?? 0),
    0,
  );

  const exchangeRate = Number(
    process.env.COST_USD_TO_BRL ?? "6",
  );

  const recentEvents: EventSummary[] = (
    recentResult.data ?? []
  ).map((event: any) => ({
    id: String(event.id),
    startedAt: String(event.started_at),
    summary: String(event.summary),
    type: String(event.primary_event_type),
    confidence: Number(event.confidence),
    requiresReview: Boolean(event.requires_review),
  }));

  return {
    cameras: cameraResult.count ?? 0,
    agentsOnline: agentResult.count ?? 0,
    eventsToday: eventResult.count ?? 0,
    estimatedCostBrl: usageUsd * exchangeRate,
    recentEvents,
    retention: retentionResult.data ?? {
      temporary_frame_days: 3,
      keyframe_days: 90,
      metadata_days: 90,
    },
    databaseReady:
      !cameraResult.error && !eventResult.error,
  };
}

export async function getOrganizationCameras(
  organizationId: string,
): Promise<CameraSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cameras")
    .select(`
      id,
      site_id,
      name,
      description,
      status,
      analysis_plan_code,
      pairing_status,
      paired_at,
      monitoring_goals,
      capture_interval_seconds,
      consolidation_interval_seconds,
      motion_adaptive_enabled,
      motion_overlay_mask,
      monitoring_schedule,
      created_at,
      site:sites(name)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "Falha ao carregar câmeras:",
      error.message,
    );
    return [];
  }

  return (data ?? []).map((row: any) => {
    const relation = row.site;
    const site = Array.isArray(relation)
      ? relation[0]
      : relation;

    return {
      id: String(row.id),
      siteId: String(row.site_id),
      siteName: String(site?.name ?? "Local"),
      name: String(row.name),
      description: String(row.description ?? ""),
      status: String(row.status),
      planCode: String(row.analysis_plan_code),
      pairingStatus: String(row.pairing_status),
      pairedAt: row.paired_at
        ? String(row.paired_at)
        : null,
      monitoringGoals: Array.isArray(row.monitoring_goals)
        ? row.monitoring_goals.map((goal: unknown) =>
            String(goal),
          )
        : [],
      captureIntervalSeconds: Number(
        row.capture_interval_seconds,
      ),
      consolidationIntervalSeconds: Number(
        row.consolidation_interval_seconds,
      ),
      motionAdaptiveEnabled:
        row.motion_adaptive_enabled !== false,
      motionOverlayMask: String(
        row.motion_overlay_mask ?? "auto",
      ),
      monitoringSchedule: objectValue(
        row.monitoring_schedule,
      ),
      createdAt: String(row.created_at),
    };
  });
}

export async function getOrganizationCamera(
  organizationId: string,
  cameraId: string,
): Promise<CameraSummary | null> {
  const cameras =
    await getOrganizationCameras(organizationId);

  return (
    cameras.find((camera) => camera.id === cameraId) ?? null
  );
}
