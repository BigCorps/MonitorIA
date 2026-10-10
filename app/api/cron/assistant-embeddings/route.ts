import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { processEmbeddingBatchV3 } from "@/src/assistant/embedding-worker-v3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Deliberately not scheduled in vercel.json. Scheduling and enablement require approval.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16 || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (process.env.MONITORIA_ASSISTANT_EMBEDDINGS_V3_ENABLED !== "true") {
    return NextResponse.json({ ok: true, enabled: false });
  }
  try {
    const admin = createAdminClient();
    const metrics = await processEmbeddingBatchV3({ enabled: true,
      rpc: async (name, args) => admin.rpc(name, args) });
    // No prompts, raw errors, evidence IDs or scene text in logs/metrics.
    console.info("assistant_embeddings_v3", metrics);
    return NextResponse.json({ ok: true, ...metrics }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "embedding_batch_unavailable" }, { status: 503 });
  }
}
