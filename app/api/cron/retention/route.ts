import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_SIZE = 100;
const MAX_STORAGE_BATCHES = 20;
const MAX_METADATA_BATCHES = 8;
const ALLOWED_BUCKETS = new Set([
  "analysis-frames",
  "event-keyframes",
  "event-clips",
  "preserved-clips",
]);

type ExpiredAsset = { id: string; bucket: string; storage_path: string };

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret && secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();
  let scanned = 0;
  let storageObjectsDeleted = 0;
  let storageRowsMarked = 0;
  let eventsDeleted = 0;
  let analysisJobsDeleted = 0;
  let assetRowsDeleted = 0;
  const failures: Array<{ bucket: string; message: string }> = [];

  for (let batch = 0; batch < MAX_STORAGE_BATCHES; batch += 1) {
    const { data: rows, error: listError } = await supabase
      .from("storage_assets")
      .select("id,bucket,storage_path")
      .not("expires_at", "is", null)
      .lte("expires_at", now)
      .is("deleted_at", null)
      .order("expires_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (listError) {
      console.error("Falha ao listar ativos expirados:", listError.message);
      return NextResponse.json({ ok: false, error: "expired_assets_unavailable" }, { status: 500 });
    }

    const assets = (rows ?? []) as ExpiredAsset[];
    scanned += assets.length;
    if (!assets.length) break;

    const byBucket = new Map<string, ExpiredAsset[]>();
    for (const asset of assets) {
      if (!ALLOWED_BUCKETS.has(asset.bucket)) {
        failures.push({ bucket: asset.bucket, message: "bucket_not_allowed" });
        continue;
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
        failures.push({ bucket, message: removeError.message });
        console.error(`Falha ao remover objetos de ${bucket}:`, removeError.message);
        continue;
      }
      storageObjectsDeleted += group.length;
      deletedIds.push(...group.map((asset) => asset.id));
    }

    if (deletedIds.length) {
      const { error: markError } = await supabase
        .from("storage_assets")
        .update({ status: "deleted", deleted_at: now })
        .in("id", deletedIds);
      if (markError) {
        console.error("Falha ao registrar exclusão de ativos:", markError.message);
        return NextResponse.json({
          ok: false,
          error: "asset_deletion_registration_failed",
          storageObjectsDeleted,
        }, { status: 500 });
      }
      storageRowsMarked += deletedIds.length;
    }

    if (assets.length < BATCH_SIZE) break;
  }

  for (let batch = 0; batch < MAX_METADATA_BATCHES; batch += 1) {
    const { data: purgeRows, error: purgeError } = await supabase.rpc(
      "purge_expired_monitoria_metadata",
      { p_limit: 500 },
    );
    if (purgeError) {
      console.error("Falha ao expurgar metadados:", purgeError.message);
      return NextResponse.json({
        ok: false,
        error: "metadata_purge_failed",
        storageObjectsDeleted,
      }, { status: 500 });
    }

    const purge = Array.isArray(purgeRows) ? purgeRows[0] : purgeRows;
    const currentEvents = Number(purge?.events_deleted ?? 0);
    const currentJobs = Number(purge?.jobs_deleted ?? 0);
    const currentAssets = Number(purge?.asset_rows_deleted ?? 0);
    eventsDeleted += currentEvents;
    analysisJobsDeleted += currentJobs;
    assetRowsDeleted += currentAssets;
    if (!currentEvents && !currentJobs && !currentAssets) break;
  }

  const { data: healthRows, error: healthError } = await supabase
    .from("camera_retention_usage")
    .select("events_with_keyframe_mismatch");
  const keyframeMismatches = healthError
    ? null
    : (healthRows ?? []).reduce(
        (total: number, row: any) => total + Number(row.events_with_keyframe_mismatch ?? 0),
        0,
      );
  if (healthError) console.error("Falha ao consultar saúde da retenção:", healthError.message);

  return NextResponse.json({
    ok: true,
    scanned,
    storageObjectsDeleted,
    storageRowsMarked,
    eventsDeleted,
    analysisJobsDeleted,
    assetRowsDeleted,
    keyframeMismatches,
    failedBuckets: failures,
    executedAt: now,
  }, { headers: { "Cache-Control": "no-store" } });
}
