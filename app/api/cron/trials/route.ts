import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TRIAL_BATCH_SIZE = 8;
const ASSET_BATCH_SIZE = 500;
const ALLOWED_BUCKETS = new Set([
  "analysis-frames",
  "event-keyframes",
  "preserved-clips",
]);

type TrialDue = {
  id: string;
  organization_id: string;
};

type TrialAsset = {
  id: string;
  bucket: string;
  storage_path: string;
};

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

async function deleteTrialAssets(
  supabase: ReturnType<typeof createAdminClient>,
  trialId: string,
) {
  const { data, error } = await supabase
    .from("storage_assets")
    .select("id,bucket,storage_path")
    .eq("trial_run_id", trialId)
    .is("deleted_at", null)
    .neq("status", "deleted")
    .order("created_at", { ascending: true })
    .limit(ASSET_BATCH_SIZE);

  if (error) throw new Error(error.message);

  const assets = (data ?? []) as TrialAsset[];
  const byBucket = new Map<string, TrialAsset[]>();

  for (const asset of assets) {
    if (!ALLOWED_BUCKETS.has(asset.bucket)) {
      throw new Error(`trial_bucket_not_allowed:${asset.bucket}`);
    }

    const group = byBucket.get(asset.bucket) ?? [];
    group.push(asset);
    byBucket.set(asset.bucket, group);
  }

  const deletedIds: string[] = [];

  for (const [bucket, group] of byBucket) {
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(group.map((asset) => asset.storage_path));

    if (removeError) {
      throw new Error(`trial_storage_remove_failed:${removeError.message}`);
    }

    deletedIds.push(...group.map((asset) => asset.id));
  }

  if (deletedIds.length) {
    const { error: markError } = await supabase
      .from("storage_assets")
      .update({
        status: "deleted",
        deleted_at: new Date().toISOString(),
      })
      .in("id", deletedIds);

    if (markError) {
      throw new Error(`trial_storage_mark_failed:${markError.message}`);
    }
  }

  const { count, error: countError } = await supabase
    .from("storage_assets")
    .select("id", { count: "exact", head: true })
    .eq("trial_run_id", trialId)
    .is("deleted_at", null)
    .neq("status", "deleted");

  if (countError) throw new Error(countError.message);

  return {
    scanned: assets.length,
    deleted: deletedIds.length,
    remaining: count ?? 0,
  };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: transitions, error: transitionError } =
    await supabase.rpc("process_monitoria_trials");

  if (transitionError) {
    console.error(
      "Falha ao processar estados do trial:",
      transitionError.message,
    );
    return NextResponse.json(
      { ok: false, error: "trial_transition_failed" },
      { status: 500 },
    );
  }

  const { data: dueRows, error: dueError } = await supabase
    .from("trial_runs")
    .select("id,organization_id")
    .eq("status", "expired")
    .lte("purge_after", now)
    .order("purge_after", { ascending: true })
    .limit(TRIAL_BATCH_SIZE);

  if (dueError) {
    console.error("Falha ao listar trials vencidos:", dueError.message);
    return NextResponse.json(
      { ok: false, error: "trial_purge_list_failed" },
      { status: 500 },
    );
  }

  const results: Array<Record<string, unknown>> = [];

  for (const trial of (dueRows ?? []) as TrialDue[]) {
    try {
      const storage = await deleteTrialAssets(supabase, trial.id);

      if (storage.remaining > 0) {
        results.push({
          trialId: trial.id,
          status: "storage_pending",
          ...storage,
        });
        continue;
      }

      const { data: purge, error: purgeError } = await supabase.rpc(
        "purge_monitoria_trial_data",
        { p_trial_run_id: trial.id },
      );

      if (purgeError) throw new Error(purgeError.message);

      results.push({
        trialId: trial.id,
        status: "purged",
        storage,
        purge,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(`Falha no expurgo do trial ${trial.id}:`, message);
      results.push({
        trialId: trial.id,
        status: "failed",
        error: message,
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      transitions,
      due: dueRows?.length ?? 0,
      results,
      executedAt: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
