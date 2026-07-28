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

export type EventSummary = {
  id: string;
  startedAt: string;
  summary: string;
  type: string;
  confidence: number;
  requiresReview: boolean;
};

function zonedStartIso(timeZone: string, year: number, month: number, day: number) {
  const localMidnightAsUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
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
  const value = (type: string) => Number(offsetParts.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(
    value("year"),
    value("month") - 1,
    value("day"),
    value("hour"),
    value("minute"),
    value("second"),
  );
  const offsetMs = representedAsUtc - localMidnightAsUtc.getTime();
  return new Date(localMidnightAsUtc.getTime() - offsetMs).toISOString();
}

function localDateParts(timeZone: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function startOfLocalDayIso(timeZone: string) {
  const { year, month, day } = localDateParts(timeZone);
  return zonedStartIso(timeZone, year, month, day);
}

function startOfMonthIso(timeZone: string) {
  const { year, month } = localDateParts(timeZone);
  return zonedStartIso(timeZone, year, month, 1);
}

export async function getCurrentOrganization(userId: string): Promise<OrganizationSummary | null> {
  const supabase = await createClient();
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("role, organization:organizations(id,name,slug,plan_code)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error || !memberships?.length) return null;

  const membership = memberships[0] as {
    role: string;
    organization: { id: string; name: string; slug: string; plan_code: string } | Array<{ id: string; name: string; slug: string; plan_code: string }> | null;
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

export async function getOrganizationSites(organizationId: string): Promise<SiteSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sites")
    .select("id,name,timezone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((site) => ({
    id: String(site.id),
    name: String(site.name),
    timezone: String(site.timezone),
  }));
}

export async function getDashboardData(organization: OrganizationSummary, site: SiteSummary) {
  const supabase = await createClient();
  const dayStart = startOfLocalDayIso(site.timezone);
  const monthStart = startOfMonthIso(site.timezone);

  const [cameraResult, agentResult, eventResult, usageResult, recentResult, retentionResult] = await Promise.all([
    supabase.from("cameras").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("site_id", site.id),
    supabase.from("agents").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("site_id", site.id).eq("status", "online"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("site_id", site.id).gte("started_at", dayStart),
    supabase.from("usage_events").select("estimated_cost_usd").eq("organization_id", organization.id).gte("created_at", monthStart),
    supabase
      .from("events")
      .select("id,started_at,summary,primary_event_type,confidence,requires_review")
      .eq("organization_id", organization.id)
      .eq("site_id", site.id)
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("retention_policies")
      .select("temporary_frame_days,keyframe_days,metadata_days")
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  const usageUsd = (usageResult.data ?? []).reduce(
    (total, row) => total + Number(row.estimated_cost_usd ?? 0),
    0,
  );
  const exchangeRate = Number(process.env.COST_USD_TO_BRL ?? "6");

  const recentEvents: EventSummary[] = (recentResult.data ?? []).map((event) => ({
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
      keyframe_days: 365,
      metadata_days: 365,
    },
    databaseReady: !cameraResult.error && !eventResult.error,
  };
}
