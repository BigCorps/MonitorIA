import { createHash } from "node:crypto";
import type { McpAuthContext } from "./auth";
import { createEnvelope } from "./envelope";
import { resolveOrganizationId } from "./grants";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function range(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - 24 * 60 * 60 * 1000);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.getTime() >= end.getTime()
  ) {
    throw new Error("invalid_date_range");
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString(
    "base64url",
  );
}

function decodeCursor(cursor?: string) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    const offset = Number(value?.offset);
    return Number.isFinite(offset) && offset >= 0
      ? Math.floor(offset)
      : 0;
  } catch {
    throw new Error("invalid_cursor");
  }
}

function countResult(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return 1;
  return 0;
}

function sanitizeCamera(row: any) {
  return {
    id: String(row.id),
    site_id: String(row.site_id),
    name: String(row.name),
    description: String(row.description ?? ""),
    status: String(row.status ?? "unknown"),
    plan: String(row.analysis_plan_code ?? "basic"),
    pairing_status: String(row.pairing_status ?? "unknown"),
    monitoring_enabled: row.monitoring_enabled !== false,
    monitoring_goals: Array.isArray(row.monitoring_goals)
      ? row.monitoring_goals
      : [],
    intelligence_mode: String(row.intelligence_mode ?? "auto"),
    scene_density: String(row.scene_density ?? "normal"),
    multi_entity_enabled: row.multi_entity_enabled !== false,
    vehicle_memory_enabled: row.vehicle_memory_enabled !== false,
    complexity_routing_enabled:
      row.complexity_routing_enabled !== false,
    verification_enabled: row.verification_enabled !== false,
    monitoring_schedule: objectValue(row.monitoring_schedule),
    created_at: String(row.created_at),
  };
}

async function capabilities(
  context: McpAuthContext,
  organizationId: string,
) {
  const { data, error } = await context.supabase.rpc(
    "mcp_get_capabilities",
    { p_organization_id: organizationId },
  );

  if (error) {
    return {
      toolset: "available",
      events: "available",
      states: "unknown",
      sessions: "unknown",
      people: "unknown",
      vehicles: "unknown",
      insights: "available",
    };
  }

  return objectValue(data);
}

async function timezoneForScope(
  context: McpAuthContext,
  organizationId: string,
  siteId?: string,
) {
  let query = context.supabase
    .from("sites")
    .select("timezone")
    .eq("organization_id", organizationId);

  if (siteId) query = query.eq("id", siteId);

  const { data } = await query.order("created_at", {
    ascending: true,
  }).limit(1).maybeSingle();

  return data?.timezone
    ? String(data.timezone)
    : "America/Sao_Paulo";
}

async function audit(
  context: McpAuthContext,
  input: {
    toolName: string;
    organizationId?: string | null;
    args: unknown;
    status: "success" | "error";
    durationMs: number;
    resultCount?: number;
    errorCode?: string | null;
  },
) {
  const argumentHash = createHash("sha256")
    .update(JSON.stringify(input.args ?? {}))
    .digest("hex");

  const { error } = await context.supabase
    .from("mcp_tool_audit_logs")
    .insert({
      user_id: context.userId,
      client_id: context.clientId,
      organization_id: input.organizationId ?? null,
      tool_name: input.toolName,
      status: input.status,
      duration_ms: Math.max(0, Math.round(input.durationMs)),
      result_count: Math.max(0, input.resultCount ?? 0),
      argument_hash: argumentHash,
      error_code: input.errorCode ?? null,
    });

  if (error) {
    console.error("Falha ao registrar auditoria MCP:", error.message);
  }
}

export async function executeMcpDataTool<T>(
  context: McpAuthContext,
  toolName: string,
  args: unknown,
  handler: () => Promise<T>,
  organizationId?: string | null,
) {
  const started = performance.now();

  try {
    const result = await handler();
    await audit(context, {
      toolName,
      organizationId,
      args,
      status: "success",
      durationMs: performance.now() - started,
      resultCount: countResult(result),
    });
    return result;
  } catch (error) {
    const code = error instanceof Error ? error.message : "tool_error";
    await audit(context, {
      toolName,
      organizationId,
      args,
      status: "error",
      durationMs: performance.now() - started,
      errorCode: code.slice(0, 100),
    });
    throw error;
  }
}

export async function getMonitoriaCapabilities(
  context: McpAuthContext,
  args: { organization_id?: string },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const timezone = await timezoneForScope(context, organizationId);
  const capabilityData = await capabilities(context, organizationId);

  return createEnvelope({
    organizationId,
    timezone,
    data: {
      organizations: context.organizations,
      public_tools: [
        "get_monitoria_capabilities",
        "list_sites",
        "list_cameras",
        "get_camera_overview",
        "search_events",
        "get_event_details",
        "search_operational_sessions",
        "get_session_details",
        "get_visual_state",
        "get_operational_summary",
        "compare_periods",
        "get_evidence",
        "search_insights",
        "ask_monitoria",
      ],
    },
    capabilities: capabilityData,
    limitations: [
      "As correspondências de pessoas e veículos são probabilísticas, não identidade.",
      "O MCP público v1 é somente leitura.",
      "Imagens só são liberadas por get_evidence e usam URLs temporárias.",
    ],
  });
}

export async function listSites(
  context: McpAuthContext,
  args: { organization_id?: string; limit?: number },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const { data, error } = await context.supabase
    .from("sites")
    .select("id,name,timezone,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(Math.min(100, args.limit ?? 100));

  if (error) throw new Error("sites_query_failed");

  return createEnvelope({
    organizationId,
    timezone: data?.[0]?.timezone
      ? String(data[0].timezone)
      : null,
    data: {
      sites: (data ?? []).map((site: any) => ({
        id: String(site.id),
        name: String(site.name),
        timezone: String(site.timezone),
      })),
    },
    capabilities: await capabilities(context, organizationId),
  });
}

export async function listCameras(
  context: McpAuthContext,
  args: {
    organization_id?: string;
    site_id?: string;
    status?: string;
    limit?: number;
  },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  let query = context.supabase
    .from("cameras")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(Math.min(100, args.limit ?? 100));

  if (args.site_id) query = query.eq("site_id", args.site_id);
  if (args.status) query = query.eq("status", args.status);

  const { data, error } = await query;
  if (error) throw new Error("cameras_query_failed");

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: { cameras: (data ?? []).map(sanitizeCamera) },
    capabilities: await capabilities(context, organizationId),
  });
}

export async function searchEvents(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  const offset = decodeCursor(args.cursor);
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25)));

  const { data, error } = await context.supabase.rpc(
    "search_monitoria_events",
    {
      p_organization_id: organizationId,
      p_query: args.query?.trim() || null,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
      p_event_type: args.event_type || null,
      p_min_confidence:
        args.min_confidence === undefined
          ? null
          : Number(args.min_confidence),
      p_review_filter: args.review_filter || "all",
      p_has_people:
        args.has_people === undefined ? null : args.has_people,
      p_has_vehicles:
        args.has_vehicles === undefined ? null : args.has_vehicles,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) throw new Error("events_query_failed");

  const rows = (data ?? []).map((row: any) => ({
    id: String(row.id),
    started_at: String(row.started_at),
    ended_at: String(row.ended_at),
    duration_seconds: Number(row.duration_seconds ?? 0),
    camera_id: String(row.camera_id),
    camera_name: String(row.camera_name),
    site_id: String(row.site_id),
    site_name: String(row.site_name),
    headline: String(row.headline ?? row.summary),
    event_type: String(row.event_type),
    summary: String(row.summary),
    confidence: Number(row.confidence),
    requires_review: Boolean(row.requires_review),
    people_count: Number(row.people_count ?? 0),
    vehicle_count: Number(row.vehicle_count ?? 0),
    probable_people_count: Number(row.probable_people_count ?? 0),
    interaction_event_count: Number(row.interaction_event_count ?? 1),
    operational_session_id: row.operational_session_id
      ? String(row.operational_session_id)
      : null,
    session_type: row.session_type ? String(row.session_type) : null,
    thumbnail_asset_id: row.thumbnail_asset_id
      ? String(row.thumbnail_asset_id)
      : null,
    evidence_available: Boolean(row.thumbnail_asset_id),
  }));

  const total = Number((data?.[0] as any)?.total_count ?? rows.length);
  const nextOffset = offset + rows.length;

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      range: selectedRange,
      events: rows,
      total,
    },
    capabilities: await capabilities(context, organizationId),
    pagination: {
      limit,
      cursor: args.cursor ?? null,
      next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    },
  });
}

export async function getEventDetails(
  context: McpAuthContext,
  args: {
    organization_id?: string;
    event_id: string;
    include_evidence?: boolean;
  },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const { data: event, error } = await context.supabase
    .from("events")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", args.event_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !event) throw new Error("event_not_found");

  const [people, vehicles, reviews, chapters] = await Promise.all([
    context.supabase
      .from("event_people")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("event_id", args.event_id)
      .order("created_at", { ascending: true }),
    context.supabase
      .from("event_vehicles")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("event_id", args.event_id)
      .order("created_at", { ascending: true }),
    context.supabase
      .from("event_reviews")
      .select("id,verdict,corrected_event_type,notes,created_at")
      .eq("organization_id", organizationId)
      .eq("event_id", args.event_id)
      .order("created_at", { ascending: false }),
    context.supabase
      .from("operational_session_events")
      .select("session_id,chapter_order,chapter_type,is_key_chapter,confidence,signal_summary")
      .eq("organization_id", organizationId)
      .eq("event_id", args.event_id)
      .maybeSingle(),
  ]);

  const payload = objectValue((event as any).analyzed_payload);
  const safeEvent = {
    id: String((event as any).id),
    site_id: String((event as any).site_id),
    camera_id: String((event as any).camera_id),
    started_at: String((event as any).started_at),
    ended_at: String((event as any).ended_at),
    duration_seconds: Number((event as any).duration_seconds ?? 0),
    headline: String((event as any).headline ?? (event as any).summary),
    event_type: String(
      (event as any).corrected_event_type ??
        (event as any).primary_event_type,
    ),
    original_event_type: String((event as any).primary_event_type),
    summary: String((event as any).summary),
    confidence: Number((event as any).confidence),
    requires_review: Boolean((event as any).requires_review),
    review_status: String((event as any).review_status),
    tags: arrayValue((event as any).tags),
    zone_ids: arrayValue((event as any).zone_ids),
    interaction_group_id: (event as any).interaction_group_id,
    probable_people_count: Number(
      (event as any).probable_people_count ?? 0,
    ),
    probable_customer_count: Number(
      (event as any).probable_customer_count ?? 0,
    ),
    probable_staff_count: Number(
      (event as any).probable_staff_count ?? 0,
    ),
    continuity_confidence: Number(
      (event as any).continuity_confidence ?? 0,
    ),
    operational_session_id: (event as any).operational_session_id,
    session_type: (event as any).session_type,
    session_status: (event as any).session_status,
    session_chapter_type: (event as any).session_chapter_type,
    session_chapter_order: (event as any).session_chapter_order,
    session_chapter_count: Number(
      (event as any).session_chapter_count ?? 0,
    ),
    session_confidence: Number((event as any).session_confidence ?? 0),
    observations: arrayValue(payload.observations),
    objects: arrayValue(payload.objects),
    scene_complexity: objectValue(payload.sceneComplexity),
    simultaneous_actions: arrayValue(payload.simultaneousActions),
  };

  let evidence: Array<Record<string, unknown>> = [];
  if (args.include_evidence) {
    const evidenceEnvelope = await getEvidence(context, {
      organization_id: organizationId,
      event_id: args.event_id,
      limit: 6,
    });
    evidence = evidenceEnvelope.evidence;
  }

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      String((event as any).site_id),
    ),
    data: {
      event: safeEvent,
      people: people.data ?? [],
      vehicles: vehicles.data ?? [],
      reviews: reviews.data ?? [],
      session_chapter: chapters.data ?? null,
    },
    capabilities: await capabilities(context, organizationId),
    evidence,
    limitations: [
      "Papéis, continuidade e correspondências são estimativas visuais.",
    ],
  });
}

export async function searchOperationalSessions(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  const offset = decodeCursor(args.cursor);
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25)));

  const { data, error } = await context.supabase.rpc(
    "search_operational_sessions",
    {
      p_organization_id: organizationId,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
      p_session_type: args.session_type || null,
      p_status: args.status || null,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) throw new Error("sessions_query_failed");
  const rows = data ?? [];
  const total = Number((rows[0] as any)?.total_count ?? rows.length);
  const nextOffset = offset + rows.length;

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      range: selectedRange,
      sessions: rows,
      total,
    },
    capabilities: await capabilities(context, organizationId),
    pagination: {
      limit,
      cursor: args.cursor ?? null,
      next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    },
  });
}

export async function getSessionDetails(
  context: McpAuthContext,
  args: {
    organization_id?: string;
    session_id: string;
    include_evidence?: boolean;
  },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const { data: session, error } = await context.supabase
    .from("operational_sessions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", args.session_id)
    .maybeSingle();

  if (error || !session) throw new Error("session_not_found");

  const [chapters, participants, outcomes] = await Promise.all([
    context.supabase
      .from("operational_session_events")
      .select("*,event:events(id,started_at,ended_at,headline,summary,primary_event_type,confidence)")
      .eq("organization_id", organizationId)
      .eq("session_id", args.session_id)
      .order("chapter_order", { ascending: true }),
    context.supabase
      .from("operational_session_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("session_id", args.session_id)
      .order("first_seen_at", { ascending: true }),
    context.supabase
      .from("operational_session_outcomes")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("session_id", args.session_id)
      .order("created_at", { ascending: true }),
  ]);

  let evidence: Array<Record<string, unknown>> = [];
  if (args.include_evidence) {
    const evidenceEnvelope = await getEvidence(context, {
      organization_id: organizationId,
      session_id: args.session_id,
      limit: 8,
    });
    evidence = evidenceEnvelope.evidence;
  }

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      String((session as any).site_id),
    ),
    data: {
      session,
      chapters: chapters.data ?? [],
      participants: participants.data ?? [],
      outcomes: outcomes.data ?? [],
    },
    capabilities: await capabilities(context, organizationId),
    evidence,
    limitations: [
      "Participantes são instâncias visuais temporárias e não identidades civis.",
    ],
  });
}

export async function getVisualState(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  const { data, error } = await context.supabase.rpc(
    "assistant_visual_state_summary",
    {
      p_organization_id: organizationId,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
    },
  );

  if (error) throw new Error("visual_state_query_failed");
  const result = objectValue(data);

  if (args.entity_id) {
    result.currentStates = arrayValue(result.currentStates).filter(
      (item: any) => String(item?.entityId) === args.entity_id,
    );
    result.transitions = arrayValue(result.transitions).filter(
      (item: any) => String(item?.entityId) === args.entity_id,
    );
  }

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      range: selectedRange,
      visual_state: result,
    },
    capabilities: await capabilities(context, organizationId),
  });
}

async function rpcJson(
  context: McpAuthContext,
  name: string,
  params: Record<string, unknown>,
) {
  const { data, error } = await context.supabase.rpc(name, params);
  if (error) return { available: false, error: error.message };
  return { available: true, data };
}

export async function getOperationalSummary(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  const include = new Set<string>(args.include ?? []);
  const common = {
    p_organization_id: organizationId,
    p_from: selectedRange.from,
    p_to: selectedRange.to,
    p_camera_id: args.camera_id || null,
    p_site_id: args.site_id || null,
  };

  const tasks: Record<string, Promise<unknown>> = {};

  if (include.has("events")) {
    tasks.events = rpcJson(context, "mcp_period_event_summary", common);
  }
  if (include.has("sessions")) {
    tasks.sessions = rpcJson(
      context,
      "assistant_operational_sessions_summary",
      common,
    );
  }
  if (include.has("states")) {
    tasks.states = rpcJson(
      context,
      "assistant_visual_state_summary",
      common,
    );
  }
  if (include.has("operating_hours")) {
    tasks.operating_hours = rpcJson(
      context,
      "assistant_operating_hours_summary",
      common,
    );
  }
  if (include.has("people")) {
    tasks.people = rpcJson(
      context,
      "assistant_continuity_summary",
      common,
    );
  }
  if (include.has("vehicles")) {
    tasks.vehicles = rpcJson(
      context,
      "assistant_vehicle_continuity_summary",
      common,
    );
  }
  if (include.has("insights")) {
    tasks.insights = searchInsights(context, {
      organization_id: organizationId,
      site_id: args.site_id,
      camera_id: args.camera_id,
      from: selectedRange.from,
      to: selectedRange.to,
      limit: 50,
    });
  }

  const entries = await Promise.all(
    Object.entries(tasks).map(async ([key, promise]) => [key, await promise]),
  );
  const summary = Object.fromEntries(entries);

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      range: selectedRange,
      summary,
    },
    capabilities: await capabilities(context, organizationId),
    limitations: [
      "Contagens de pessoas e veículos distintos são estimativas probabilísticas.",
      "Ausência de evento não prova ausência de atividade quando a câmera estava indisponível ou sem visibilidade.",
    ],
  });
}

export async function getCameraOverview(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const { data: camera, error } = await context.supabase
    .from("cameras")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", args.camera_id)
    .maybeSingle();

  if (error || !camera) throw new Error("camera_not_found");

  const selectedRange = range(args.from, args.to);
  const overview = await getOperationalSummary(context, {
    organization_id: organizationId,
    camera_id: args.camera_id,
    site_id: String((camera as any).site_id),
    from: selectedRange.from,
    to: selectedRange.to,
    include: args.include,
  });

  const { data: latest } = await context.supabase
    .from("events")
    .select("id,started_at,headline,summary,primary_event_type,confidence,requires_review")
    .eq("organization_id", organizationId)
    .eq("camera_id", args.camera_id)
    .is("deleted_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return createEnvelope({
    organizationId,
    timezone: overview.timezone,
    data: {
      camera: sanitizeCamera(camera),
      latest_event: latest ?? null,
      overview: overview.data,
    },
    capabilities: overview.capabilities,
    limitations: overview.limitations,
  });
}

export async function comparePeriods(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );

  const { data: eventComparison, error } = await context.supabase.rpc(
    "compare_monitoria_periods",
    {
      p_organization_id: organizationId,
      p_from_a: args.from_a,
      p_to_a: args.to_a,
      p_from_b: args.from_b,
      p_to_b: args.to_b,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
    },
  );

  if (error) throw new Error("period_comparison_failed");

  const common = {
    p_organization_id: organizationId,
    p_camera_id: args.camera_id || null,
    p_site_id: args.site_id || null,
  };

  const [sessionsA, sessionsB, insightsA, insightsB] =
    await Promise.all([
      rpcJson(context, "assistant_operational_sessions_summary", {
        ...common,
        p_from: args.from_a,
        p_to: args.to_a,
      }),
      rpcJson(context, "assistant_operational_sessions_summary", {
        ...common,
        p_from: args.from_b,
        p_to: args.to_b,
      }),
      searchInsights(context, {
        organization_id: organizationId,
        camera_id: args.camera_id,
        site_id: args.site_id,
        from: args.from_a,
        to: args.to_a,
        limit: 100,
      }),
      searchInsights(context, {
        organization_id: organizationId,
        camera_id: args.camera_id,
        site_id: args.site_id,
        from: args.from_b,
        to: args.to_b,
        limit: 100,
      }),
    ]);

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      period_a: { from: args.from_a, to: args.to_a },
      period_b: { from: args.from_b, to: args.to_b },
      events: eventComparison,
      sessions: { period_a: sessionsA, period_b: sessionsB },
      insights: {
        period_a: insightsA.data,
        period_b: insightsB.data,
      },
    },
    capabilities: await capabilities(context, organizationId),
  });
}

export async function getEvidence(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const limit = Math.min(12, Math.max(1, Number(args.limit ?? 6)));
  let eventIds: string[] = [];

  if (args.session_id) {
    const { data: chapterRows, error } = await context.supabase
      .from("operational_session_events")
      .select("event_id")
      .eq("organization_id", organizationId)
      .eq("session_id", args.session_id)
      .order("chapter_order", { ascending: true })
      .limit(limit);
    if (error) throw new Error("session_evidence_query_failed");
    eventIds = (chapterRows ?? []).map((row: any) => String(row.event_id));
  }

  if (args.event_id) eventIds.push(String(args.event_id));
  eventIds = [...new Set(eventIds)];

  let query = context.supabase
    .from("storage_assets")
    .select("id,event_id,camera_id,bucket,storage_path,mime_type,width,height,captured_at,expires_at")
    .eq("organization_id", organizationId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .order("captured_at", { ascending: true })
    .limit(limit);

  if (args.asset_ids?.length) {
    query = query.in("id", args.asset_ids);
  } else if (eventIds.length) {
    query = query.in("event_id", eventIds);
  } else {
    throw new Error("evidence_selector_required");
  }

  const { data: assets, error } = await query;
  if (error) throw new Error("evidence_query_failed");

  const ttl = Math.max(
    60,
    Math.min(
      900,
      Number(process.env.MCP_EVIDENCE_URL_TTL_SECONDS ?? 300),
    ),
  );

  const evidence: Array<Record<string, unknown>> = [];

  for (const asset of assets ?? []) {
    const bucket = String((asset as any).bucket);
    const storagePath = String((asset as any).storage_path);
    const { data: signed, error: signedError } =
      await context.supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, ttl);

    evidence.push({
      asset_id: String((asset as any).id),
      event_id: (asset as any).event_id
        ? String((asset as any).event_id)
        : null,
      camera_id: String((asset as any).camera_id),
      mime_type: String((asset as any).mime_type ?? "image/jpeg"),
      width: (asset as any).width,
      height: (asset as any).height,
      captured_at: (asset as any).captured_at,
      url: signedError ? null : signed?.signedUrl ?? null,
      url_expires_in_seconds: signedError ? null : ttl,
      unavailable_reason: signedError ? signedError.message : null,
    });
  }

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(context, organizationId),
    data: {
      count: evidence.length,
      evidence_policy: "explicit_request_only",
    },
    capabilities: await capabilities(context, organizationId),
    evidence,
    limitations: [
      "As URLs são temporárias e não devem ser armazenadas como links permanentes.",
      "A evidência visual pode conter pessoas, veículos e informações do ambiente privado.",
    ],
  });
}

export async function searchInsights(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  const offset = decodeCursor(args.cursor);
  const limit = Math.min(100, Math.max(1, Number(args.limit ?? 25)));

  const { data, error } = await context.supabase.rpc(
    "search_monitoria_insights",
    {
      p_organization_id: organizationId,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
      p_insight_types: args.insight_types?.length
        ? args.insight_types
        : null,
      p_severity: args.severity?.length ? args.severity : null,
      p_status: args.status?.length ? args.status : null,
      p_query: args.query?.trim() || null,
      p_limit: limit,
      p_offset: offset,
    },
  );

  if (error) throw new Error("insights_query_failed");
  const rows = data ?? [];
  const total = Number((rows[0] as any)?.total_count ?? rows.length);
  const nextOffset = offset + rows.length;

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      range: selectedRange,
      insights: rows,
      total,
    },
    capabilities: await capabilities(context, organizationId),
    pagination: {
      limit,
      cursor: args.cursor ?? null,
      next_cursor: nextOffset < total ? encodeCursor(nextOffset) : null,
    },
  });
}

export async function askMonitoria(
  context: McpAuthContext,
  args: Record<string, any>,
) {
  const question = String(args.question).toLocaleLowerCase("pt-BR");
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);
  let intent = "operational_summary";
  let answerData: unknown;

  if (/abr|fech|hor[aá]rio|expediente|cortina|port[aã]o/.test(question)) {
    intent = "operating_hours_and_states";
    const common = {
      p_organization_id: organizationId,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
    };
    answerData = {
      operating_hours: await rpcJson(
        context,
        "assistant_operating_hours_summary",
        common,
      ),
      visual_states: await rpcJson(
        context,
        "assistant_visual_state_summary",
        common,
      ),
    };
  } else if (/atendimento|sess[aã]o|cliente|espera|balc[aã]o/.test(question)) {
    intent = "operational_sessions";
    answerData = await rpcJson(
      context,
      "assistant_operational_sessions_summary",
      {
        p_organization_id: organizationId,
        p_from: selectedRange.from,
        p_to: selectedRange.to,
        p_camera_id: args.camera_id || null,
        p_site_id: args.site_id || null,
      },
    );
  } else if (/ve[ií]cul|carro|moto|caminh[aã]o|estacion/.test(question)) {
    intent = "vehicle_continuity";
    answerData = await rpcJson(
      context,
      "assistant_vehicle_continuity_summary",
      {
        p_organization_id: organizationId,
        p_from: selectedRange.from,
        p_to: selectedRange.to,
        p_camera_id: args.camera_id || null,
        p_site_id: args.site_id || null,
      },
    );
  } else if (/pessoa|funcion[aá]ri|visitante|quantos clientes/.test(question)) {
    intent = "person_continuity";
    answerData = await rpcJson(
      context,
      "assistant_continuity_summary",
      {
        p_organization_id: organizationId,
        p_from: selectedRange.from,
        p_to: selectedRange.to,
        p_camera_id: args.camera_id || null,
        p_site_id: args.site_id || null,
      },
    );
  } else if (/rotina|desvio|alerta|sa[uú]de|obstru|fora do normal|anomalia/.test(question)) {
    intent = "operational_insights";
    answerData = (
      await searchInsights(context, {
        organization_id: organizationId,
        camera_id: args.camera_id,
        site_id: args.site_id,
        from: selectedRange.from,
        to: selectedRange.to,
        limit: 50,
      })
    ).data;
  } else {
    answerData = (
      await getOperationalSummary(context, {
        organization_id: organizationId,
        camera_id: args.camera_id,
        site_id: args.site_id,
        from: selectedRange.from,
        to: selectedRange.to,
        include: [
          "events",
          "sessions",
          "states",
          "operating_hours",
          "people",
          "vehicles",
          "insights",
        ],
      })
    ).data;
  }

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      question: args.question,
      selected_intent: intent,
      range: selectedRange,
      result: answerData,
      response_guidance:
        "A IA cliente deve responder usando apenas estas evidências, deixando estimativas explícitas.",
    },
    capabilities: await capabilities(context, organizationId),
    limitations: [
      "A seleção de intenção é determinística; o modelo cliente redige a resposta final.",
      "Não inferir crime, intenção ou identidade a partir dos dados visuais.",
    ],
  });
}
