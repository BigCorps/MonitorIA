import type { AssistantOperation } from "./v2-contracts";
import { embedTexts, projectEmbeddingQuery, type EmbedTexts } from "./embedding-v3";

export type HybridScope = {
  organizationId: string; from: string; to: string; query: string;
  cameraId: string | null; siteId: string | null; operation: AssistantOperation; limit: number;
};
export type HybridTelemetry = {
  mode: "lexical" | "hybrid"; fallback: "none" | "no_embeddings" | "provider_unavailable" | "unsafe_or_empty_query";
  latencyMs: number; embeddingTokens: number; embeddingCostUsd: number; returnedCount: number; embeddingCoverage: number;
};
export type HybridResult = Record<string, unknown> & { events: Array<Record<string, unknown>>; total: null; totalIsExact: false; returnedCount: number };
export type SearchRpc = (args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;

export function hybridSearchEnabled(organizationId: string, env: Record<string, string | undefined> = process.env): boolean {
  return env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED === "true" &&
    (env.MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS ?? "").split(",").map((v) => v.trim()).includes(organizationId);
}
export function hybridOperationEligible(op: AssistantOperation): boolean {
  // Exact counts / first / last / duration keep the existing deterministic engine.
  return op.kind === "search_events" && ["list", "exists"].includes(op.aggregation);
}
function resultValue(data: unknown): HybridResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("hybrid_result_invalid");
  const value = data as HybridResult;
  if (value.totalIsExact !== false || value.total !== null || !Array.isArray(value.events) ||
    !Number.isInteger(value.returnedCount) || value.returnedCount !== value.events.length) throw new Error("hybrid_result_invalid");
  return value;
}

/** A request-scoped cache: never persisted, never shared between users/tenants. */
export function createHybridSearchV3(rpc: SearchRpc, embed: EmbedTexts = embedTexts) {
  const cache = new Map<string, ReturnType<EmbedTexts>>();
  let providerUnavailable = false;
  let embeddingCalls = 0;
  return async (scope: HybridScope): Promise<{ result: HybridResult; telemetry: HybridTelemetry } | null> => {
    const started = performance.now();
    const args = {
      p_organization_id: scope.organizationId, p_from: scope.from, p_to: scope.to, p_query: scope.query,
      p_camera_id: scope.cameraId, p_site_id: scope.siteId, p_zone_id: scope.operation.zoneId,
      p_event_types: scope.operation.eventTypes.length ? scope.operation.eventTypes : null,
      p_apparent_age_group: scope.operation.apparentAgeGroup,
      p_after_confirmed_closing: scope.operation.afterConfirmedClosing, p_requires_review: null,
      p_limit: Math.max(1, Math.min(scope.limit, 50)), p_embedding: null as string | null,
    };
    const first = await rpc(args);
    // Pending migration is an explicitly observable legacy path, not an empty result.
    if (first.error && ["PGRST202", "42883"].includes(first.error.code ?? "")) return null;
    if (first.error) throw new Error("hybrid_database_unavailable");
    let result = resultValue(first.data);
    const text = projectEmbeddingQuery(scope.query);
    const telemetry: HybridTelemetry = { mode: "lexical", fallback: "none", latencyMs: 0,
      embeddingTokens: 0, embeddingCostUsd: 0, returnedCount: result.returnedCount,
      embeddingCoverage: Number(result.embeddingCoverage ?? 0) };
    // The first RPC reports eligible embedding count even without query vector.
    if (!telemetry.embeddingCoverage) telemetry.fallback = "no_embeddings";
    else if (!text) telemetry.fallback = "unsafe_or_empty_query";
    else if (providerUnavailable || embeddingCalls >= 3 && !cache.has(text)) telemetry.fallback = "provider_unavailable";
    else {
      let batch;
      try {
        if (!cache.has(text)) {
          embeddingCalls += 1;
          cache.set(text, embed([text], 1000));
          batch = await cache.get(text)!;
          telemetry.embeddingTokens = batch.tokens; telemetry.embeddingCostUsd = batch.costUsd;
        } else batch = await cache.get(text)!;
      } catch {
        providerUnavailable = true;
        telemetry.fallback = "provider_unavailable";
      }
      if (batch) {
        // Database failures must escape. Only optional provider failures degrade.
        const second = await rpc({ ...args, p_embedding: JSON.stringify(batch.vectors[0]) });
        if (second.error) throw new Error("hybrid_database_unavailable");
        result = resultValue(second.data); telemetry.mode = "hybrid";
      }
    }
    telemetry.latencyMs = Math.round(performance.now() - started);
    telemetry.returnedCount = result.returnedCount;
    return { result, telemetry };
  };
}
