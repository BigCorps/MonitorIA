import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addAssistantUsage,
  answerAssistantQuery,
  planAssistantQuery,
} from "@/src/assistant/openai";
import type {
  AssistantDirectory,
  AssistantHistoryItem,
  AssistantPlan,
} from "@/src/assistant/contracts";
import { buildAssistantChart } from "@/src/assistant/chart";
import { getAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  addDaysToDateOnly,
  dateOnlyToIso,
  searchEvents,
  siteTimezone,
  type SearchEventRow,
} from "@/src/lib/event-search-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { estimateVisionCostBreakdown } from "@/src/vision/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const RequestSchema = z
  .object({
    message: z.string().trim().min(2).max(2000),
    threadId: z.string().uuid().nullable(),
    fromDate: DateOnlySchema,
    toDate: DateOnlySchema,
    cameraId: z.string().uuid().nullable(),
    siteId: z.string().uuid().nullable(),
  })
  .strict();

type EvidenceResponse = {
  id: string;
  startedAt: string;
  headline: string;
  summary: string;
  cameraName: string;
  siteName: string;
  confidence: number;
  thumbnailAssetId: string | null;
};

function currentDateInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function isValidDateOnly(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function safeDate(value: string | null, fallback: string) {
  return isValidDateOnly(value) ? value : fallback;
}

function previousPeriod(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
  const compareTo = addDaysToDateOnly(fromDate, -1);
  const compareFrom = addDaysToDateOnly(compareTo, -(days - 1));
  return { compareFrom, compareTo };
}

async function hydrateEvidence(
  organizationId: string,
  eventIds: string[],
): Promise<EvidenceResponse[]> {
  const ids = [...new Set(eventIds)].slice(0, 12);
  if (!ids.length) return [];

  const admin = createAdminClient();
  const [{ data: events }, { data: assets }] = await Promise.all([
    admin
      .from("events")
      .select(`
        id,
        started_at,
        headline,
        summary,
        confidence,
        camera:cameras(name),
        site:sites(name)
      `)
      .eq("organization_id", organizationId)
      .in("id", ids)
      .is("deleted_at", null),
    admin
      .from("storage_assets")
      .select("id,event_id,captured_at")
      .eq("organization_id", organizationId)
      .in("event_id", ids)
      .eq("status", "ready")
      .is("deleted_at", null)
      .order("captured_at", { ascending: false }),
  ]);

  const assetByEvent = new Map<string, string>();
  for (const asset of assets ?? []) {
    const eventId = String((asset as any).event_id);
    if (!assetByEvent.has(eventId)) {
      assetByEvent.set(eventId, String((asset as any).id));
    }
  }

  const byId = new Map<string, EvidenceResponse>();
  for (const event of events ?? []) {
    const camera = relationOne((event as any).camera);
    const site = relationOne((event as any).site);
    const id = String((event as any).id);
    byId.set(id, {
      id,
      startedAt: String((event as any).started_at),
      headline: String((event as any).headline),
      summary: String((event as any).summary),
      cameraName: String((camera as any)?.name ?? "Câmera"),
      siteName: String((site as any)?.name ?? "Local"),
      confidence: Number((event as any).confidence ?? 0),
      thumbnailAssetId: assetByEvent.get(id) ?? null,
    });
  }

  return ids.flatMap((id) => {
    const event = byId.get(id);
    return event ? [event] : [];
  });
}

function evidenceIdsFromSummary(value: unknown) {
  const summary = objectValue(value);
  return Array.isArray(summary.evidence)
    ? summary.evidence
        .map((item) => objectValue(item).id)
        .filter((id): id is string => typeof id === "string")
    : [];
}

function evidenceIdsFromRows(rows: SearchEventRow[]) {
  return rows.map((row) => row.id);
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json(
      { ok: false, error: "organization_not_found" },
      { status: 404 },
    );
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      { ok: false, error: "assistant_not_configured" },
      { status: 503 },
    );
  }

  const [sites, cameras] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
  ]);

  const allowedSiteIds = new Set(sites.map((site) => site.id));
  const allowedCameraIds = new Set(cameras.map((camera) => camera.id));
  const selectedSiteId =
    body.siteId && allowedSiteIds.has(body.siteId)
      ? body.siteId
      : null;
  const selectedCamera =
    body.cameraId && allowedCameraIds.has(body.cameraId)
      ? cameras.find((camera) => camera.id === body.cameraId) ?? null
      : null;
  const selectedCameraId =
    selectedCamera &&
    (!selectedSiteId || selectedCamera.siteId === selectedSiteId)
      ? selectedCamera.id
      : null;
  const timeZone = siteTimezone(sites, selectedSiteId);
  const currentDate = currentDateInZone(timeZone);

  const admin = createAdminClient();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await admin
    .from("assistant_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("created_by", user.id)
    .eq("role", "user")
    .gte("created_at", oneMinuteAgo);

  if ((recentCount ?? 0) >= 15) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      { status: 429 },
    );
  }

  const isNewThread = !body.threadId;
  let threadId = body.threadId;
  let history: AssistantHistoryItem[] = [];

  if (threadId) {
    const { data: thread } = await admin
      .from("assistant_threads")
      .select("id")
      .eq("id", threadId)
      .eq("organization_id", organization.id)
      .eq("created_by", user.id)
      .is("archived_at", null)
      .maybeSingle();

    if (!thread) {
      return NextResponse.json(
        { ok: false, error: "thread_not_found" },
        { status: 404 },
      );
    }

    const { data: historyRows } = await admin
      .from("assistant_messages")
      .select("role,content")
      .eq("organization_id", organization.id)
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(8);

    history = (historyRows ?? [])
      .reverse()
      .map((message: any) => ({
        role:
          message.role === "assistant" ? "assistant" : "user",
        content: String(message.content).slice(0, 1800),
      }));
  } else {
    const title = body.message.replace(/\s+/g, " ").slice(0, 80);
    const { data: created, error } = await admin
      .from("assistant_threads")
      .insert({
        organization_id: organization.id,
        created_by: user.id,
        title,
      })
      .select("id")
      .single();

    if (error || !created) {
      return NextResponse.json(
        { ok: false, error: "thread_creation_failed" },
        { status: 500 },
      );
    }

    threadId = String(created.id);
  }

  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: "thread_creation_failed" },
      { status: 500 },
    );
  }

  const activeThreadId = threadId;

  const { data: userMessage, error: userMessageError } = await admin
    .from("assistant_messages")
    .insert({
      organization_id: organization.id,
      thread_id: activeThreadId,
      role: "user",
      content: body.message,
      created_by: user.id,
    })
    .select("id,created_at")
    .single();

  if (userMessageError || !userMessage) {
    return NextResponse.json(
      { ok: false, error: "message_creation_failed" },
      { status: 500 },
    );
  }

  try {
    const directory: AssistantDirectory = {
      sites: sites.map((site) => ({
        id: site.id,
        name: site.name,
        timezone: site.timezone,
      })),
      cameras: cameras.map((camera) => ({
        id: camera.id,
        name: camera.name,
        siteId: camera.siteId,
      })),
    };

    const planned = await planAssistantQuery({
      organizationId: organization.id,
      message: body.message,
      currentDate,
      timezone: timeZone,
      selectedFrom: body.fromDate,
      selectedTo: body.toDate,
      selectedCameraId,
      selectedSiteId,
      directory,
      history,
    });

    const plannedSiteId =
      selectedSiteId ??
      (planned.plan.siteId &&
      allowedSiteIds.has(planned.plan.siteId)
        ? planned.plan.siteId
        : null);
    const plannedCamera =
      selectedCameraId
        ? cameras.find((camera) => camera.id === selectedCameraId) ?? null
        : planned.plan.cameraId &&
            allowedCameraIds.has(planned.plan.cameraId)
          ? cameras.find(
              (camera) => camera.id === planned.plan.cameraId,
            ) ?? null
          : null;

    const plan: AssistantPlan = {
      ...planned.plan,
      siteId: plannedSiteId,
      cameraId:
        plannedCamera &&
        (!plannedSiteId || plannedCamera.siteId === plannedSiteId)
          ? plannedCamera.id
          : null,
    };

    const effectiveTimeZone = siteTimezone(sites, plan.siteId);
    const fromDate = safeDate(
      body.fromDate ?? plan.fromDate,
      currentDate,
    );
    const toDate = safeDate(
      body.toDate ?? plan.toDate,
      currentDate,
    );
    const fromIso = dateOnlyToIso(fromDate, effectiveTimeZone)!;
    const toIso = dateOnlyToIso(
      addDaysToDateOnly(toDate, 1),
      effectiveTimeZone,
    )!;

    const supabase = await createClient();
    let retrievedData: unknown = {};
    let candidateEvidenceIds: string[] = [];

    if (plan.intent === "vehicle_continuity") {
      const result = await supabase.rpc(
        "assistant_vehicle_continuity_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const vehicles = Array.isArray(payload.vehicles)
        ? payload.vehicles.map(objectValue)
        : [];

      candidateEvidenceIds = vehicles
        .flatMap((vehicle) =>
          Array.isArray(vehicle.evidenceEventIds)
            ? vehicle.evidenceEventIds
            : [],
        )
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        vehicleContinuity: result.data,
        definitions: {
          probableDistinctVehicles:
            "Estimativa temporária baseada em tipo, cor, carroceria, porte, características visíveis, zona e proximidade temporal.",
          limitation:
            "Veículos visualmente semelhantes podem ser indistinguíveis sem característica distintiva ou sequência suficiente.",
        },
      };
    } else if (plan.intent === "interaction_sessions") {
      const result = await supabase.rpc(
        "assistant_operational_sessions_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const sessions = Array.isArray(payload.sessions)
        ? payload.sessions.map(objectValue)
        : [];

      candidateEvidenceIds = sessions
        .flatMap((session) =>
          Array.isArray(session.evidence_event_ids)
            ? session.evidence_event_ids
            : Array.isArray(session.evidenceEventIds)
              ? session.evidenceEventIds
              : [],
        )
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        operationalSessions: result.data,
        definitions: {
          session:
            "História operacional formada por capítulos visualmente relacionados.",
          outcome:
            "Resultado visual observado; não confirma venda, pagamento ou intenção.",
          closureByInactivity:
            "Encerramento calculado quando não houve novo capítulo dentro da janela configurada.",
        },
      };
    } else if (plan.intent === "continuity_summary") {
      const result = await supabase.rpc(
        "assistant_continuity_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const groups = Array.isArray(payload.groups)
        ? payload.groups.map(objectValue)
        : [];

      candidateEvidenceIds = groups
        .flatMap((group) =>
          Array.isArray(group.evidenceEventIds)
            ? group.evidenceEventIds
            : [],
        )
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        continuity: result.data,
        definitions: {
          probableDistinctPeople:
            "Estimativa temporária baseada em aparência não biométrica, posição e proximidade temporal.",
          interactionGroup:
            "Conjunto de capítulos que provavelmente pertencem à mesma visita ou atendimento.",
          staffProfile:
            "Perfil operacional aprovado; não é reconhecimento facial.",
        },
      };
    } else if (plan.intent === "operating_hours") {
      const result = await supabase.rpc(
        "assistant_operating_hours_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const sessions = Array.isArray(payload.sessions)
        ? payload.sessions.map(objectValue)
        : [];

      candidateEvidenceIds = sessions
        .flatMap((session) => [
          typeof session.openingEventId === "string"
            ? session.openingEventId
            : null,
          typeof session.closingEventId === "string"
            ? session.closingEventId
            : null,
        ])
        .filter((id): id is string => Boolean(id));

      retrievedData = {
        operatingHours: result.data,
        definitions: {
          observedOnly:
            "O estado já era visível naquele momento; a transição exata não foi capturada.",
          visibleTransition:
            "Os quadros mostram visualmente a mudança de estado.",
          declaredHours:
            "O horário cadastrado é contexto e não prova que o estabelecimento estava aberto ou fechado.",
        },
      };
    } else if (plan.intent === "visual_state") {
      const result = await supabase.rpc(
        "assistant_visual_state_summary",
        {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        },
      );

      if (result.error) {
        throw new Error(result.error.message);
      }

      const payload = objectValue(result.data);
      const transitions = Array.isArray(payload.transitions)
        ? payload.transitions.map(objectValue)
        : [];

      candidateEvidenceIds = transitions
        .map((transition) => transition.eventId)
        .filter((id): id is string => typeof id === "string");

      retrievedData = {
        visualStates: result.data,
        definitions: {
          outsideDeclaredHours:
            "O evento ocorreu fora da janela semanal cadastrada.",
          afterConfirmedClosing:
            "O evento ocorreu depois de um fechamento visual confirmado e antes de uma reabertura confirmada.",
        },
      };
    } else if (plan.intent === "period_summary") {
      const [summaryResult, matchingEvents] = await Promise.all([
        supabase.rpc("assistant_period_summary", {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        }),
        plan.query.trim()
          ? searchEvents(organization.id, {
              query: plan.query,
              from: fromIso,
              to: toIso,
              cameraId: plan.cameraId,
              siteId: plan.siteId,
              limit: plan.evidenceLimit,
              offset: 0,
            })
          : Promise.resolve({ rows: [], total: 0 }),
      ]);

      if (summaryResult.error) {
        throw new Error(summaryResult.error.message);
      }

      const summaryEvidenceIds = evidenceIdsFromSummary(
        summaryResult.data,
      );
      candidateEvidenceIds = matchingEvents.rows.length
        ? evidenceIdsFromRows(matchingEvents.rows)
        : summaryEvidenceIds;

      retrievedData = {
        summary: summaryResult.data,
        matchingEvents: matchingEvents.rows,
        matchingEventsTotal: matchingEvents.total,
      };
    } else if (plan.intent === "search_events") {
      const result = await searchEvents(organization.id, {
        query: plan.query || body.message,
        from: fromIso,
        to: toIso,
        cameraId: plan.cameraId,
        siteId: plan.siteId,
        limit: plan.evidenceLimit,
        offset: 0,
      });
      retrievedData = {
        totalFound: result.total,
        events: result.rows,
        definitions: {
          peopleCount:
            "Pessoas estruturadas no evento, sem deduplicação entre eventos.",
          vehicleCount:
            "Veículos estruturados no evento, sem deduplicação entre eventos.",
        },
      };
      candidateEvidenceIds = evidenceIdsFromRows(result.rows);
    } else if (plan.intent === "compare_periods") {
      const fallback = previousPeriod(fromDate, toDate);
      const compareFromDate = safeDate(
        plan.compareFromDate,
        fallback.compareFrom,
      );
      const compareToDate = safeDate(
        plan.compareToDate,
        fallback.compareTo,
      );
      const compareFromIso = dateOnlyToIso(
        compareFromDate,
        effectiveTimeZone,
      )!;
      const compareToIso = dateOnlyToIso(
        addDaysToDateOnly(compareToDate, 1),
        effectiveTimeZone,
      )!;

      const [
        summaryA,
        summaryB,
        eventsA,
        eventsB,
      ] = await Promise.all([
        supabase.rpc("assistant_period_summary", {
          p_organization_id: organization.id,
          p_from: fromIso,
          p_to: toIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        }),
        supabase.rpc("assistant_period_summary", {
          p_organization_id: organization.id,
          p_from: compareFromIso,
          p_to: compareToIso,
          p_camera_id: plan.cameraId,
          p_site_id: plan.siteId,
        }),
        searchEvents(organization.id, {
          query: plan.query || null,
          from: fromIso,
          to: toIso,
          cameraId: plan.cameraId,
          siteId: plan.siteId,
          limit: 4,
        }),
        searchEvents(organization.id, {
          query: plan.query || null,
          from: compareFromIso,
          to: compareToIso,
          cameraId: plan.cameraId,
          siteId: plan.siteId,
          limit: 4,
        }),
      ]);

      if (summaryA.error || summaryB.error) {
        throw new Error(
          summaryA.error?.message ??
            summaryB.error?.message ??
            "comparison_summary_failed",
        );
      }

      retrievedData = {
        periodA: {
          fromDate,
          toDate,
          summary: summaryA.data,
        },
        periodB: {
          fromDate: compareFromDate,
          toDate: compareToDate,
          summary: summaryB.data,
        },
      };
      candidateEvidenceIds = [
        ...eventsA.rows.map((event) => event.id),
        ...eventsB.rows.map((event) => event.id),
      ];
    } else {
      retrievedData = {
        capabilities: [
          "estimar pessoas distintas e agrupar capítulos do mesmo atendimento",
          "consolidar capítulos em sessões operacionais com duração e resultado visual",
          "diferenciar funcionários prováveis por perfis operacionais aprovados",
          "informar abertura e fechamento visualmente confirmados",
          "consultar o estado atual de entidades configuradas",
          "localizar mudanças em caixas, armários, objetos, equipamentos e áreas",
          "resumir períodos",
          "estimar aparições de clientes e funcionários",
          "localizar entregas, objetos e veículos",
          "comparar períodos",
          "mostrar eventos como evidência",
        ],
        limitations: [
          "não identifica pessoas",
          "não conta clientes únicos",
          "não confirma vendas sem integração transacional",
        ],
      };
    }

    candidateEvidenceIds = [
      ...new Set(candidateEvidenceIds),
    ].slice(0, 12);

    const answered = await answerAssistantQuery({
      organizationId: organization.id,
      message: body.message,
      plan: {
        ...plan,
        fromDate,
        toDate,
      },
      retrievedData,
      allowedEvidenceIds: candidateEvidenceIds,
      history,
    });

    const allowedSet = new Set(candidateEvidenceIds);
    let evidenceIds = answered.answer.evidenceEventIds.filter((id) =>
      allowedSet.has(id),
    );
    if (!evidenceIds.length && plan.intent !== "general_help") {
      evidenceIds = candidateEvidenceIds.slice(0, 4);
    }

    const chart = buildAssistantChart({
      plan,
      retrievedData,
      fromDate,
      toDate,
    });

    const combinedUsage = addAssistantUsage(
      planned.usage,
      answered.usage,
    );
    const cost = estimateVisionCostBreakdown(
      answered.model,
      combinedUsage,
    );

    const queryPlan = {
      ...plan,
      fromDate,
      toDate,
      periodLabel: answered.answer.periodLabel,
      caution: answered.answer.caution,
      suggestions: answered.answer.suggestions,
      chart,
      plannerResponseId: planned.responseId,
      answerResponseId: answered.responseId,
    };

    const { data: assistantMessage, error: assistantError } =
      await admin
        .from("assistant_messages")
        .insert({
          organization_id: organization.id,
          thread_id: activeThreadId,
          role: "assistant",
          content: answered.answer.answer,
          evidence_event_ids: evidenceIds,
          query_plan: queryPlan,
          model: answered.model,
          usage: combinedUsage,
          estimated_cost_usd: cost.totalCostUsd,
          created_by: null,
        })
        .select("id,created_at")
        .single();

    if (assistantError || !assistantMessage) {
      throw new Error(
        assistantError?.message ?? "assistant_message_failed",
      );
    }

    await Promise.all([
      admin
        .from("assistant_threads")
        .update({
          last_message_at: assistantMessage.created_at,
          updated_at: assistantMessage.created_at,
        })
        .eq("id", activeThreadId)
        .eq("organization_id", organization.id)
        .eq("created_by", user.id),
      admin.from("usage_events").insert({
        organization_id: organization.id,
        camera_id: plan.cameraId,
        analysis_job_id: null,
        provider: "openai",
        model: answered.model,
        input_tokens: combinedUsage.inputTokens,
        cached_input_tokens: combinedUsage.cachedInputTokens,
        output_tokens: combinedUsage.outputTokens,
        reasoning_tokens: combinedUsage.reasoningTokens,
        estimated_cost_usd: cost.totalCostUsd,
        pricing: cost.rates,
        metadata: {
          purpose: "assistant_query",
          thread_id: activeThreadId,
          user_message_id: userMessage.id,
          assistant_message_id: assistantMessage.id,
          intent: plan.intent,
          cost_breakdown: cost,
        },
      }),
    ]);

    const evidence = await hydrateEvidence(
      organization.id,
      evidenceIds,
    );

    return NextResponse.json(
      {
        ok: true,
        threadId: activeThreadId,
        userMessage: {
          id: String(userMessage.id),
          role: "user",
          content: body.message,
          createdAt: String(userMessage.created_at),
          evidenceEventIds: [],
          periodLabel: null,
          caution: null,
          suggestions: [],
          chart: null,
        },
        assistantMessage: {
          id: String(assistantMessage.id),
          role: "assistant",
          content: answered.answer.answer,
          createdAt: String(assistantMessage.created_at),
          evidenceEventIds: evidenceIds,
          periodLabel: answered.answer.periodLabel,
          caution: answered.answer.caution,
          suggestions: answered.answer.suggestions,
          chart,
        },
        evidence,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Falha no Assistente MonitorIA:", error);

    await admin
      .from("assistant_messages")
      .delete()
      .eq("id", userMessage.id)
      .eq("organization_id", organization.id)
      .eq("thread_id", activeThreadId)
      .eq("created_by", user.id);

    if (isNewThread) {
      await admin
        .from("assistant_threads")
        .delete()
        .eq("id", activeThreadId)
        .eq("organization_id", organization.id)
        .eq("created_by", user.id);
    }

    return NextResponse.json(
      { ok: false, error: "assistant_query_failed" },
      { status: 503 },
    );
  }
}
