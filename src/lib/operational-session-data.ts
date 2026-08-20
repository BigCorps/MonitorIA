import { createClient } from "@/src/lib/supabase/server";

export type OperationalSessionRow = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  cameraId: string;
  cameraName: string;
  siteId: string;
  siteName: string;
  timezone: string;
  sessionType: string;
  status: string;
  title: string;
  summary: string;
  chapterCount: number;
  probablePeopleCount: number;
  probableCustomerCount: number;
  probableStaffCount: number;
  outcomeCode: string;
  confidence: number;
  thumbnailAssetId: string | null;
};

export type OperationalSessionSearchInput = {
  from?: string | null;
  to?: string | null;
  cameraId?: string | null;
  siteId?: string | null;
  sessionType?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
};

export type OperationalSessionDetail = OperationalSessionRow & {
  closureReason: string | null;
  participants: Array<{
    id: string;
    role: string;
    staffLabel: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    confidence: number;
  }>;
  outcomes: Array<{
    code: string;
    description: string;
    confidence: number;
    evidenceEventIds: string[];
  }>;
  chapters: Array<{
    id: string;
    eventId: string;
    chapterOrder: number;
    chapterType: string;
    isKeyChapter: boolean;
    confidence: number;
    startedAt: string;
    endedAt: string;
    headline: string;
    summary: string;
    eventType: string;
    thumbnailAssetId: string | null;
  }>;
};

function relationOne<T>(
  value: T | T[] | null | undefined,
): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function plural(
  value: number,
  singular: string,
  pluralValue: string,
) {
  return `${value} ${value === 1 ? singular : pluralValue}`;
}

export function operationalPeriodSummary(
  row: Pick<
    OperationalSessionRow,
    "chapterCount" | "probableCustomerCount" | "probableStaffCount"
  >,
) {
  const parts = [
    plural(row.chapterCount, "registro relacionado", "registros relacionados"),
  ];

  if (row.probableCustomerCount > 0) {
    parts.push(
      plural(
        row.probableCustomerCount,
        "cliente ou visitante provável",
        "clientes ou visitantes prováveis",
      ),
    );
  }

  if (row.probableStaffCount > 0) {
    parts.push(
      plural(
        row.probableStaffCount,
        "integrante da equipe provável",
        "integrantes da equipe prováveis",
      ),
    );
  }

  return parts.join(" · ");
}

function mapSessionRow(row: any): OperationalSessionRow {
  const mapped: OperationalSessionRow = {
    id: String(row.id),
    startedAt: String(row.started_at),
    endedAt: String(row.ended_at),
    durationSeconds: Number(row.duration_seconds ?? 0),
    cameraId: String(row.camera_id),
    cameraName: String(row.camera_name),
    siteId: String(row.site_id),
    siteName: String(row.site_name),
    timezone: String(row.timezone ?? "America/Sao_Paulo"),
    sessionType: String(row.session_type ?? "other"),
    status: String(row.status ?? "open"),
    title: String(row.title ?? "Atividade observada"),
    summary: String(row.summary ?? ""),
    chapterCount: Number(row.chapter_count ?? 0),
    probablePeopleCount: Number(row.probable_people_count ?? 0),
    probableCustomerCount: Number(row.probable_customer_count ?? 0),
    probableStaffCount: Number(row.probable_staff_count ?? 0),
    outcomeCode: String(row.outcome_code ?? "in_progress"),
    confidence: Number(row.confidence ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
      ? String(row.thumbnail_asset_id)
      : null,
  };

  return {
    ...mapped,
    summary: operationalPeriodSummary(mapped),
  };
}

export async function searchOperationalSessions(
  organizationId: string,
  input: OperationalSessionSearchInput = {},
) {
  const supabase = await createClient();

  await supabase.rpc("finalize_stale_operational_sessions_v1", {
    p_organization_id: organizationId,
    p_camera_id: input.cameraId || null,
  });

  const { data, error } = await supabase.rpc(
    "search_operational_sessions",
    {
      p_organization_id: organizationId,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_camera_id: input.cameraId || null,
      p_site_id: input.siteId || null,
      p_session_type: input.sessionType || null,
      p_status: input.status || "all",
      p_limit: Math.max(1, Math.min(input.limit ?? 30, 100)),
      p_offset: Math.max(0, input.offset ?? 0),
    },
  );

  if (error) {
    console.error("Falha ao pesquisar períodos:", error.message);
    return { rows: [] as OperationalSessionRow[], total: 0 };
  }

  const rows = (data ?? []).map(mapSessionRow);
  return {
    rows,
    total: Number((data?.[0] as any)?.total_count ?? 0),
  };
}

export async function getOperationalSessionDetail(
  organizationId: string,
  sessionId: string,
): Promise<OperationalSessionDetail | null> {
  const supabase = await createClient();

  const { data: sessionRow, error: sessionError } = await supabase
    .from("operational_sessions")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      session_type,
      status,
      closure_reason,
      started_at,
      last_event_at,
      ended_at,
      duration_seconds,
      title,
      summary,
      chapter_count,
      probable_people_count,
      probable_customer_count,
      probable_staff_count,
      outcome_code,
      confidence,
      camera:cameras(name),
      site:sites(name,timezone)
    `)
    .eq("organization_id", organizationId)
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !sessionRow) {
    if (sessionError) {
      console.error("Falha ao carregar período:", sessionError.message);
    }
    return null;
  }

  const [chaptersResult, participantsResult, outcomesResult] =
    await Promise.all([
      supabase
        .from("operational_session_events")
        .select(
          "id,event_id,chapter_order,chapter_type,is_key_chapter,confidence",
        )
        .eq("organization_id", organizationId)
        .eq("session_id", sessionId)
        .order("chapter_order", { ascending: true }),
      supabase
        .from("operational_session_participants")
        .select(`
          id,
          participant_role,
          first_seen_at,
          last_seen_at,
          confidence,
          staff_profile:camera_staff_profiles(label)
        `)
        .eq("organization_id", organizationId)
        .eq("session_id", sessionId)
        .order("participant_role", { ascending: true }),
      supabase
        .from("operational_session_outcomes")
        .select(
          "outcome_code,description,confidence,evidence_event_ids,created_at",
        )
        .eq("organization_id", organizationId)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
    ]);

  const chapterRows = chaptersResult.data ?? [];
  const eventIds = chapterRows.map((row: any) => String(row.event_id));

  const [eventsResult, assetsResult] = eventIds.length
    ? await Promise.all([
        supabase
          .from("events")
          .select(
            "id,started_at,ended_at,headline,summary,primary_event_type,corrected_event_type,human_verdict",
          )
          .eq("organization_id", organizationId)
          .in("id", eventIds)
          .is("deleted_at", null),
        supabase
          .from("storage_assets")
          .select("id,event_id,storage_path,captured_at")
          .eq("organization_id", organizationId)
          .in("event_id", eventIds)
          .eq("status", "ready")
          .is("deleted_at", null)
          .order("captured_at", { ascending: false }),
      ])
    : [
        { data: [] as any[], error: null },
        { data: [] as any[], error: null },
      ];

  const eventsById = new Map<string, any>();
  for (const event of eventsResult.data ?? []) {
    eventsById.set(String((event as any).id), event);
  }

  const assetByEvent = new Map<string, string>();
  for (const asset of assetsResult.data ?? []) {
    const eventId = String((asset as any).event_id);
    const path = String((asset as any).storage_path ?? "");
    const current = assetByEvent.get(eventId);

    if (!current || path.includes("/peak.jpg")) {
      assetByEvent.set(eventId, String((asset as any).id));
    }
  }

  const camera = relationOne((sessionRow as any).camera);
  const site = relationOne((sessionRow as any).site);

  const base = mapSessionRow({
    ...sessionRow,
    camera_name: (camera as any)?.name ?? "Câmera",
    site_name: (site as any)?.name ?? "Local",
    timezone: (site as any)?.timezone ?? "America/Sao_Paulo",
    ended_at:
      sessionRow.ended_at ??
      sessionRow.last_event_at ??
      sessionRow.started_at,
    thumbnail_asset_id:
      chapterRows
        .map((row: any) => assetByEvent.get(String(row.event_id)))
        .find(Boolean) ?? null,
  });

  return {
    ...base,
    closureReason: sessionRow.closure_reason
      ? String(sessionRow.closure_reason)
      : null,
    participants: (participantsResult.data ?? []).map((row: any) => {
      const staffProfile = relationOne(row.staff_profile);
      return {
        id: String(row.id),
        role: String(row.participant_role ?? "unknown"),
        staffLabel: (staffProfile as any)?.label
          ? String((staffProfile as any).label)
          : null,
        firstSeenAt: String(row.first_seen_at),
        lastSeenAt: String(row.last_seen_at),
        confidence: Number(row.confidence ?? 0),
      };
    }),
    outcomes: (outcomesResult.data ?? []).map((row: any) => ({
      code: String(row.outcome_code),
      description: String(row.description),
      confidence: Number(row.confidence ?? 0),
      evidenceEventIds: stringArray(row.evidence_event_ids),
    })),
    chapters: chapterRows.flatMap((row: any) => {
      const eventId = String(row.event_id);
      const event = eventsById.get(eventId);
      if (!event || event.human_verdict === "irrelevant") return [];

      return [
        {
          id: String(row.id),
          eventId,
          chapterOrder: Number(row.chapter_order ?? 0),
          chapterType: String(row.chapter_type ?? "other"),
          isKeyChapter: Boolean(row.is_key_chapter),
          confidence: Number(row.confidence ?? 0),
          startedAt: String(event.started_at),
          endedAt: String(event.ended_at),
          headline: String(event.headline ?? event.summary),
          summary: String(event.summary ?? ""),
          eventType: String(
            event.corrected_event_type ?? event.primary_event_type,
          ),
          thumbnailAssetId: assetByEvent.get(eventId) ?? null,
        },
      ];
    }),
  };
}
