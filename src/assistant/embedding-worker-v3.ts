import { embedTexts, validEmbedding, type EmbedTexts } from "./embedding-v3";

type Job = { eventId: string; organizationId: string; sourceHash: string; text: string; leaseToken: string };
export type WorkerRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

/** No polling in the user request. DB leases + token reservations serialize costs. */
export async function processEmbeddingBatchV3(input: { rpc: WorkerRpc; embed?: EmbedTexts; enabled: boolean }) {
  if (!input.enabled) return { enabled: false, claimed: 0, completed: 0, stale: 0, failed: 0, tokens: 0, costUsd: 0 };
  const claimed = await input.rpc("assistant_claim_embedding_jobs_v3", { p_limit: 16 });
  if (claimed.error || !Array.isArray(claimed.data)) throw new Error("embedding_claim_failed");
  const jobs = claimed.data as Job[];
  const metrics = { enabled: true, claimed: jobs.length, completed: 0, stale: 0, failed: 0, tokens: 0, costUsd: 0 };
  if (!jobs.length) return metrics;
  let vectors: number[][] | null = null;
  try {
    const batch = await (input.embed ?? embedTexts)(jobs.map((j) => j.text), 15000);
    if (batch.vectors.length !== jobs.length || !batch.vectors.every(validEmbedding)) throw new Error("embedding_response_invalid");
    vectors = batch.vectors; metrics.tokens = batch.tokens; metrics.costUsd = batch.costUsd;
  } catch { metrics.failed = jobs.length; }
  for (const [index, job] of jobs.entries()) {
    const finished = await input.rpc("assistant_finish_embedding_job_v3", {
      p_event_id: job.eventId, p_lease_token: job.leaseToken, p_source_hash: job.sourceHash,
      p_embedding: vectors ? JSON.stringify(vectors[index]) : null,
    });
    if (finished.error) throw new Error("embedding_finish_failed");
    if (vectors) {
      if (finished.data === true) metrics.completed += 1; else metrics.stale += 1;
    }
  }
  return metrics;
}
