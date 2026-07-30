import {
  AssistantChartSpecSchema,
  type AssistantChartSpec,
} from "@/src/assistant/contracts";
import { createClient } from "@/src/lib/supabase/server";

export type AssistantThreadSummary = {
  id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
};

export type AssistantEvidence = {
  id: string;
  startedAt: string;
  headline: string;
  summary: string;
  cameraName: string;
  siteName: string;
  confidence: number;
  thumbnailAssetId: string | null;
};

export type AssistantMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidenceEventIds: string[];
  periodLabel: string | null;
  caution: string | null;
  suggestions: string[];
  chart: AssistantChartSpec | null;
  createdAt: string;
};

export type AssistantWorkspace = {
  threads: AssistantThreadSummary[];
  selectedThreadId: string | null;
  messages: AssistantMessageView[];
  evidence: Record<string, AssistantEvidence>;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getAssistantWorkspace(
  organizationId: string,
  requestedThreadId: string | null,
): Promise<AssistantWorkspace> {
  const supabase = await createClient();

  const { data: threadRows, error: threadError } = await supabase
    .from("assistant_threads")
    .select("id,title,last_message_at,created_at")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(30);

  if (threadError) {
    console.error(
      "Falha ao carregar conversas do Assistente:",
      threadError.message,
    );
  }

  const threads: AssistantThreadSummary[] = (threadRows ?? []).map(
    (thread: any) => ({
      id: String(thread.id),
      title: String(thread.title),
      lastMessageAt: String(thread.last_message_at),
      createdAt: String(thread.created_at),
    }),
  );

  const selectedThreadId =
    requestedThreadId &&
    threads.some((thread) => thread.id === requestedThreadId)
      ? requestedThreadId
      : null;

  if (!selectedThreadId) {
    return {
      threads,
      selectedThreadId: null,
      messages: [],
      evidence: {},
    };
  }

  const { data: messageRows, error: messageError } = await supabase
    .from("assistant_messages")
    .select(
      "id,role,content,evidence_event_ids,query_plan,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("thread_id", selectedThreadId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (messageError) {
    console.error(
      "Falha ao carregar mensagens do Assistente:",
      messageError.message,
    );
  }

  const messages: AssistantMessageView[] = (messageRows ?? []).map(
    (message: any) => {
      const plan = objectValue(message.query_plan);
      return {
        id: String(message.id),
        role:
          message.role === "assistant" ? "assistant" : "user",
        content: String(message.content),
        evidenceEventIds: stringArray(message.evidence_event_ids),
        periodLabel: plan.periodLabel
          ? String(plan.periodLabel)
          : null,
        caution: plan.caution ? String(plan.caution) : null,
        suggestions: stringArray(plan.suggestions),
        chart: (() => {
          const parsed = AssistantChartSpecSchema.safeParse(plan.chart);
          return parsed.success ? parsed.data : null;
        })(),
        createdAt: String(message.created_at),
      };
    },
  );

  const evidenceIds = [
    ...new Set(
      messages.flatMap((message) => message.evidenceEventIds),
    ),
  ].slice(0, 200);

  if (!evidenceIds.length) {
    return {
      threads,
      selectedThreadId,
      messages,
      evidence: {},
    };
  }

  const [{ data: events }, { data: assets }] = await Promise.all([
    supabase
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
      .in("id", evidenceIds)
      .is("deleted_at", null),
    supabase
      .from("storage_assets")
      .select("id,event_id,captured_at,storage_path")
      .eq("organization_id", organizationId)
      .in("event_id", evidenceIds)
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

  const evidence: Record<string, AssistantEvidence> = {};
  for (const event of events ?? []) {
    const camera = relationOne((event as any).camera);
    const site = relationOne((event as any).site);
    const id = String((event as any).id);

    evidence[id] = {
      id,
      startedAt: String((event as any).started_at),
      headline: String((event as any).headline),
      summary: String((event as any).summary),
      cameraName: String((camera as any)?.name ?? "Câmera"),
      siteName: String((site as any)?.name ?? "Local"),
      confidence: Number((event as any).confidence ?? 0),
      thumbnailAssetId: assetByEvent.get(id) ?? null,
    };
  }

  return {
    threads,
    selectedThreadId,
    messages,
    evidence,
  };
}
