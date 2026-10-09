import { NextResponse } from "next/server";
import { z } from "zod";
import { addAssistantUsage, answerAssistantQuery, planAssistantQuery } from "@/src/assistant/openai";
import { buildAssistantChart } from "@/src/assistant/chart";
import { AssistantPlanV2Schema, type AssistantDirectoryV2, type AssistantHistoryItemV2, type AssistantPlanV2 } from "@/src/assistant/v2-contracts";
import { executeAssistantPlanV2 } from "@/src/assistant/executor-v2";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization, getOrganizationCameras, getOrganizationSites } from "@/src/lib/dashboard-data";
import { addDaysToDateOnly, dateOnlyToIso, siteTimezone } from "@/src/lib/event-search-data";
import { assistantPeriodLabel, localizeAssistantPayload } from "@/src/lib/assistant-display";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { consumeRateLimit, rateLimitHeaders } from "@/src/lib/rate-limit";
import { estimateVisionCostBreakdown } from "@/src/vision/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const RequestSchema = z.object({
  message: z.string().trim().min(2).max(2000),
  threadId: z.string().uuid().nullable(),
  fromDate: DateOnlySchema,
  toDate: DateOnlySchema,
  cameraId: z.string().uuid().nullable(),
  siteId: z.string().uuid().nullable(),
  ageGroup: z.enum(["child", "adult"]).nullable(),
}).strict();

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
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}
function isValidDateOnly(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function safeDate(value: string | null, fallback: string) { return isValidDateOnly(value) ? value : fallback; }
function dateInZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
async function earliestAvailableDate(input: {
  admin: ReturnType<typeof createAdminClient>;
  organizationId: string;
  cameraId: string | null;
  siteId: string | null;
  timeZone: string;
}) {
  let query = input.admin
    .from("events")
    .select("started_at")
    .eq("organization_id", input.organizationId)
    .is("deleted_at", null)
    .order("started_at", { ascending: true })
    .limit(1);

  if (input.cameraId) query = query.eq("camera_id", input.cameraId);
  if (input.siteId) query = query.eq("site_id", input.siteId);

  const { data, error } = await query;
  const startedAt = data?.[0]?.started_at;
  if (error || !startedAt) return null;
  return dateInZone(String(startedAt), input.timeZone);
}
function previousPeriod(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(`${toDate}T00:00:00Z`);
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
  const compareTo = addDaysToDateOnly(fromDate, -1);
  return { compareFrom: addDaysToDateOnly(compareTo, -(days - 1)), compareTo };
}

async function hydrateEvidence(organizationId: string, eventIds: string[]): Promise<EvidenceResponse[]> {
  const ids = [...new Set(eventIds)].slice(0, 12);
  if (!ids.length) return [];
  const admin = createAdminClient();
  const [{ data: events }, { data: assets }] = await Promise.all([
    admin.from("events").select(`id,started_at,headline,summary,confidence,camera:cameras(name),site:sites(name)`).eq("organization_id", organizationId).in("id", ids).is("deleted_at", null),
    admin.from("storage_assets").select("id,event_id,captured_at").eq("organization_id", organizationId).in("event_id", ids).eq("status", "ready").is("deleted_at", null).order("captured_at", { ascending: false }),
  ]);
  const assetByEvent = new Map<string, string>();
  for (const asset of assets ?? []) {
    const eventId = String((asset as any).event_id);
    if (!assetByEvent.has(eventId)) assetByEvent.set(eventId, String((asset as any).id));
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
  return ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function directoryFromRpc(value: unknown, fallback: AssistantDirectoryV2): AssistantDirectoryV2 {
  const row = objectValue(value);
  const mapBase = (items: unknown) => Array.isArray(items) ? items.map(objectValue) : [];
  if (row.error) return fallback;
  return {
    sites: mapBase(row.sites).map((x) => ({ id: String(x.id), name: String(x.name), timezone: String(x.timezone) })),
    cameras: mapBase(row.cameras).map((x) => ({
      id: String(x.id), name: String(x.name), siteId: String(x.siteId),
      sourceKind: x.sourceKind === "local_recording" ? "local_recording" as const : "live_camera" as const,
    })),
    zones: mapBase(row.zones).map((x) => ({
      id: String(x.id), name: String(x.name), cameraId: String(x.cameraId), siteId: String(x.siteId),
      zoneType: String(x.zoneType ?? ""), description: String(x.description ?? ""), personRoleHint: x.personRoleHint ? String(x.personRoleHint) : null,
    })),
    visualEntities: mapBase(row.visualEntities).map((x) => ({
      id: String(x.id), name: String(x.name), cameraId: String(x.cameraId), siteId: String(x.siteId),
      entityType: String(x.entityType ?? ""), aliases: stringArray(x.aliases), enabled: x.enabled !== false, reliability: String(x.reliability ?? ""),
    })),
    processes: mapBase(row.processes).map((x) => ({
      id: String(x.id), name: String(x.name), processCode: String(x.processCode ?? ""),
      cameraId: x.cameraId ? String(x.cameraId) : null, siteId: String(x.siteId), description: String(x.description ?? ""),
      sessionType: String(x.sessionType ?? ""), aliases: stringArray(x.aliases),
    })),
  };
}

function applySelectedAgeGroup(
  plan: AssistantPlanV2,
  selectedAgeGroup: "child" | "adult" | null,
): AssistantPlanV2 {
  if (!selectedAgeGroup) return plan;

  let applied = false;
  const operations = plan.operations.map((op) => {
    if (op.kind !== "search_events") return op;
    applied = true;
    return {
      ...op,
      apparentAgeGroup: selectedAgeGroup,
      subject:
        selectedAgeGroup === "child"
          ? "Provável criança"
          : "Provável adulto",
    };
  });

  if (!applied && operations.length < 6) {
    operations.push({
      id: `op${operations.length + 1}`,
      kind: "search_events",
      aggregation: "list",
      metric: "events",
      subject:
        selectedAgeGroup === "child"
          ? "Provável criança"
          : "Provável adulto",
      cameraId: plan.legacyPlan.cameraId,
      siteId: plan.legacyPlan.siteId,
      fromCameraId: null,
      toCameraId: null,
      zoneId: null,
      visualEntityId: null,
      processId: null,
      eventTypes: [],
      apparentAgeGroup: selectedAgeGroup,
      afterConfirmedClosing: null,
    });
  }

  return AssistantPlanV2Schema.parse({
    ...plan,
    operations,
    plannerNotes: [
      ...plan.plannerNotes,
      `ui_age_group:${selectedAgeGroup}`,
    ].slice(0, 8),
  });
}

function sanitizePlan(plan: AssistantPlanV2, directory: AssistantDirectoryV2, selectedCameraId: string | null, selectedSiteId: string | null): AssistantPlanV2 {
  const sites = new Set(directory.sites.map((x) => x.id));
  const cameras = new Map(directory.cameras.map((x) => [x.id, x]));
  const zones = new Set(directory.zones.map((x) => x.id));
  const entities = new Set(directory.visualEntities.map((x) => x.id));
  const processes = new Set(directory.processes.map((x) => x.id));
  const safeSite = (id: string | null) => selectedSiteId ?? (id && sites.has(id) ? id : null);
  const safeCamera = (id: string | null, siteId: string | null) => {
    const wanted = selectedCameraId ?? id;
    if (!wanted || !cameras.has(wanted)) return null;
    const camera = cameras.get(wanted)!;
    return !siteId || camera.siteId === siteId ? wanted : null;
  };
  const siteId = safeSite(plan.legacyPlan.siteId);
  const cameraId = safeCamera(plan.legacyPlan.cameraId, siteId);
  return AssistantPlanV2Schema.parse({
    ...plan,
    legacyPlan: { ...plan.legacyPlan, siteId, cameraId },
    operations: plan.operations.map((op) => {
      const opSite = safeSite(op.siteId ?? siteId);
      return {
        ...op,
        siteId: opSite,
        cameraId: safeCamera(op.cameraId ?? cameraId, opSite),
        fromCameraId: safeCamera(op.fromCameraId, opSite),
        toCameraId: safeCamera(op.toCameraId, opSite),
        zoneId: op.zoneId && zones.has(op.zoneId) ? op.zoneId : null,
        visualEntityId: op.visualEntityId && entities.has(op.visualEntityId) ? op.visualEntityId : null,
        processId: op.processId && processes.has(op.processId) ? op.processId : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  let body: z.infer<typeof RequestSchema>;
  try { body = RequestSchema.parse(await request.json()); }
  catch { return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 }); }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) return NextResponse.json({ ok: false, error: "organization_not_found" }, { status: 404 });

  const [sites, cameras] = await Promise.all([getOrganizationSites(organization.id), getOrganizationCameras(organization.id)]);
  const allowedSiteIds = new Set(sites.map((x) => x.id));
  const allowedCameraIds = new Set(cameras.map((x) => x.id));
  const selectedSiteId = body.siteId && allowedSiteIds.has(body.siteId) ? body.siteId : null;
  const selectedCamera = body.cameraId && allowedCameraIds.has(body.cameraId) ? cameras.find((x) => x.id === body.cameraId) ?? null : null;
  const selectedCameraId = selectedCamera && (!selectedSiteId || selectedCamera.siteId === selectedSiteId) ? selectedCamera.id : null;
  const timeZone = siteTimezone(sites, selectedSiteId);
  const currentDate = currentDateInZone(timeZone);

  let rateLimit;
  try { rateLimit = await consumeRateLimit({ scope: "assistant-query", subject: `${organization.id}:${user.id}`, limit: 15, windowSeconds: 60 }); }
  catch { return NextResponse.json({ ok: false, error: "rate_limit_unavailable" }, { status: 503 }); }
  if (!rateLimit.allowed) return NextResponse.json({ ok: false, error: "too_many_requests" }, { status: 429, headers: rateLimitHeaders(rateLimit) });

  const admin = createAdminClient();
  const supabase = await createClient();
  const fallbackDirectory: AssistantDirectoryV2 = {
    sites: sites.map((x) => ({ id: x.id, name: x.name, timezone: x.timezone })),
    cameras: cameras.map((x) => ({ id: x.id, name: x.name, siteId: x.siteId, sourceKind: x.sourceKind })),
    zones: [], visualEntities: [], processes: [],
  };
  const directoryRpc = await supabase.rpc("assistant_context_directory_v2", { p_organization_id: organization.id });
  const directory = directoryRpc.error ? fallbackDirectory : directoryFromRpc(directoryRpc.data, fallbackDirectory);

  const isNewThread = !body.threadId;
  let threadId = body.threadId;
  let history: AssistantHistoryItemV2[] = [];
  if (threadId) {
    const { data: thread } = await admin.from("assistant_threads").select("id").eq("id", threadId).eq("organization_id", organization.id).eq("created_by", user.id).is("archived_at", null).maybeSingle();
    if (!thread) return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
    const { data: rows } = await admin.from("assistant_messages").select("role,content,query_plan").eq("organization_id", organization.id).eq("thread_id", threadId).order("created_at", { ascending: false }).limit(12);
    history = (rows ?? []).reverse().map((row: any) => ({
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content).slice(0, 1800),
      plan: (() => {
        const raw = objectValue(row.query_plan);
        const parsed = AssistantPlanV2Schema.safeParse({
          version: raw.version,
          legacyPlan: raw.legacyPlan,
          operations: raw.operations,
          plannerNotes: raw.plannerNotes ?? [],
        });
        return parsed.success ? parsed.data : null;
      })(),
    }));
  } else {
    const { data: created, error } = await admin.from("assistant_threads").insert({ organization_id: organization.id, created_by: user.id, title: body.message.replace(/\s+/g, " ").slice(0, 80) }).select("id").single();
    if (error || !created) return NextResponse.json({ ok: false, error: "thread_creation_failed" }, { status: 500 });
    threadId = String(created.id);
  }
  if (!threadId) return NextResponse.json({ ok: false, error: "thread_creation_failed" }, { status: 500 });
  const activeThreadId = threadId;

  const { data: userMessage, error: userMessageError } = await admin.from("assistant_messages").insert({
    organization_id: organization.id, thread_id: activeThreadId, role: "user", content: body.message, created_by: user.id,
  }).select("id,created_at").single();
  if (userMessageError || !userMessage) return NextResponse.json({ ok: false, error: "message_creation_failed" }, { status: 500 });

  try {
    const planned = await planAssistantQuery({
      organizationId: organization.id, message: body.message, currentDate, timezone: timeZone,
      selectedFrom: body.fromDate, selectedTo: body.toDate, selectedCameraId, selectedSiteId, directory, history,
    });
    const sanitizedPlan = sanitizePlan(
      planned.plan,
      directory,
      selectedCameraId,
      selectedSiteId,
    );
    const plan = applySelectedAgeGroup(
      sanitizedPlan,
      body.ageGroup,
    );
    const effectiveTimeZone = siteTimezone(sites, plan.legacyPlan.siteId);
    let fromDate = safeDate(body.fromDate ?? plan.legacyPlan.fromDate, currentDate);
    const toDate = safeDate(body.toDate ?? plan.legacyPlan.toDate, currentDate);

    if (
      !body.fromDate &&
      plan.plannerNotes.includes("period:available")
    ) {
      const earliest = await earliestAvailableDate({
        admin,
        organizationId: organization.id,
        cameraId: plan.legacyPlan.cameraId,
        siteId: plan.legacyPlan.siteId,
        timeZone: effectiveTimeZone,
      });
      if (earliest) fromDate = earliest;
    }

    const fromIso = dateOnlyToIso(fromDate, effectiveTimeZone)!;
    const toIso = dateOnlyToIso(addDaysToDateOnly(toDate, 1), effectiveTimeZone)!;

    const fallbackComparison = previousPeriod(fromDate, toDate);
    const compareFromDate = safeDate(plan.legacyPlan.compareFromDate, fallbackComparison.compareFrom);
    const compareToDate = safeDate(plan.legacyPlan.compareToDate, fallbackComparison.compareTo);
    const needsComparison = plan.operations.some((op) => op.kind === "compare_periods");
    const compareFromIso = needsComparison ? dateOnlyToIso(compareFromDate, effectiveTimeZone)! : null;
    const compareToIso = needsComparison ? dateOnlyToIso(addDaysToDateOnly(compareToDate, 1), effectiveTimeZone)! : null;

    const executed = await executeAssistantPlanV2({ supabase, organizationId: organization.id, plan, fromIso, toIso, compareFromIso, compareToIso });
    const localizedData = localizeAssistantPayload(executed.retrievedData, effectiveTimeZone);
    const answered = await answerAssistantQuery({
      organizationId: organization.id, message: body.message, plan,
      retrievedData: localizedData, allowedEvidenceIds: executed.candidateEvidenceIds, history,
    });

    let evidenceIds = answered.answer.evidenceEventIds.filter((id) => executed.candidateEvidenceIds.includes(id));
    if (!evidenceIds.length) evidenceIds = executed.candidateEvidenceIds.slice(0, 4);
    const displayPeriodLabel = assistantPeriodLabel(fromDate, toDate, effectiveTimeZone);
    const localizedObject = objectValue(localizedData);
    const operationResults = objectValue(localizedObject.operationResults);
    const summaryOperation = plan.operations.find((op) => op.kind === "period_summary");
    const compareOperation = plan.operations.find((op) => op.kind === "compare_periods");
    let chartData: unknown = localizedData;
    if (compareOperation) {
      const comparison = objectValue(operationResults[compareOperation.id]);
      chartData = {
        periodA: { fromDate, toDate, summary: objectValue(comparison.periodA).summary },
        periodB: { fromDate: compareFromDate, toDate: compareToDate, summary: objectValue(comparison.periodB).summary },
      };
    } else if (summaryOperation) {
      chartData = { summary: objectValue(operationResults[summaryOperation.id]).summary };
    }
    const chart = buildAssistantChart({ plan: plan.legacyPlan, retrievedData: chartData, fromDate, toDate });
    const combinedUsage = addAssistantUsage(planned.usage, answered.usage);
    const cost = estimateVisionCostBreakdown(answered.model, combinedUsage);
    const storedPlan = {
      ...plan,
      periodLabel: displayPeriodLabel,
      caution: answered.answer.caution,
      suggestions: answered.answer.suggestions,
      chart,
      plannerSource: planned.source,
      localConfidence: planned.localConfidence,
      plannerResponseId: planned.responseId,
      answerResponseId: answered.responseId,
      dataState: objectValue(executed.coverage).dataState ?? null,
    };

    const { data: assistantMessage, error: assistantError } = await admin.from("assistant_messages").insert({
      organization_id: organization.id, thread_id: activeThreadId, role: "assistant", content: answered.answer.answer,
      evidence_event_ids: evidenceIds, query_plan: storedPlan, model: answered.model, usage: combinedUsage,
      estimated_cost_usd: cost.totalCostUsd, created_by: null,
    }).select("id,created_at").single();
    if (assistantError || !assistantMessage) throw new Error(assistantError?.message ?? "assistant_message_failed");

    await Promise.all([
      admin.from("assistant_threads").update({ last_message_at: assistantMessage.created_at, updated_at: assistantMessage.created_at }).eq("id", activeThreadId).eq("organization_id", organization.id).eq("created_by", user.id),
      admin.from("usage_events").insert({
        organization_id: organization.id, camera_id: plan.legacyPlan.cameraId, analysis_job_id: null,
        provider: "openai",
        model: answered.model, input_tokens: combinedUsage.inputTokens, cached_input_tokens: combinedUsage.cachedInputTokens,
        output_tokens: combinedUsage.outputTokens, reasoning_tokens: combinedUsage.reasoningTokens,
        estimated_cost_usd: cost.totalCostUsd, pricing: cost.rates,
        metadata: {
          purpose: "assistant_query_v2", thread_id: activeThreadId, user_message_id: userMessage.id,
          assistant_message_id: assistantMessage.id, operations: plan.operations.map((op) => op.kind),
          planner_source: planned.source, data_state: objectValue(executed.coverage).dataState ?? null, cost_breakdown: cost,
        },
      }),
    ]);

    const evidence = await hydrateEvidence(organization.id, evidenceIds);
    return NextResponse.json({
      ok: true,
      threadId: activeThreadId,
      userMessage: { id: String(userMessage.id), role: "user", content: body.message, createdAt: String(userMessage.created_at), evidenceEventIds: [], periodLabel: null, caution: null, suggestions: [], chart: null },
      assistantMessage: { id: String(assistantMessage.id), role: "assistant", content: answered.answer.answer, createdAt: String(assistantMessage.created_at), evidenceEventIds: evidenceIds, periodLabel: displayPeriodLabel, caution: answered.answer.caution, suggestions: answered.answer.suggestions, chart },
      evidence,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha no Assistente MonitorIA 2.0:", error);
    await admin.from("assistant_messages").delete().eq("id", userMessage.id).eq("organization_id", organization.id).eq("thread_id", activeThreadId).eq("created_by", user.id);
    if (isNewThread) await admin.from("assistant_threads").delete().eq("id", activeThreadId).eq("organization_id", organization.id).eq("created_by", user.id);
    return NextResponse.json({ ok: false, error: "assistant_query_failed" }, { status: 503 });
  }
}
