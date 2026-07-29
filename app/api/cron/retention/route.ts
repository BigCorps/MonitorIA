import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 100;
const ALLOWED_BUCKETS = new Set([
  "analysis-frames",
  "event-keyframes",
  "preserved-clips",
]);

type ExpiredAsset = {
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

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data: rows, error: listError } = await supabase
    .from("storage_assets")
    .select("id,bucket,storage_path")
    .not("expires_at", "is", null)
    .lte("expires_at", now)
    .is("deleted_at", null)
    .order("expires_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (listError) {
    console.error(
      "Falha ao listar ativos expirados:",
      listError.message,
    );

    return NextResponse.json(
      { ok: false, error: "expired_assets_unavailable" },
      { status: 500 },
    );
  }

  const assets = (rows ?? []) as ExpiredAsset[];
  const byBucket = new Map<string, ExpiredAsset[]>();

  for (const asset of assets) {
    if (!ALLOWED_BUCKETS.has(asset.bucket)) {
      console.error(
        `Bucket não permitido no expurgo: ${asset.bucket}`,
      );
      continue;
    }

    const group = byBucket.get(asset.bucket) ?? [];
    group.push(asset);
    byBucket.set(asset.bucket, group);
  }

  const deletedAssetIds: string[] = [];
  const failures: Array<{
    bucket: string;
    message: string;
  }> = [];

  for (const [bucket, group] of byBucket) {
    const paths = group.map((asset) => asset.storage_path);

    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(paths);

    if (removeError) {
      failures.push({
        bucket,
        message: removeError.message,
      });

      console.error(
        `Falha ao remover objetos de ${bucket}:`,
        removeError.message,
      );
      continue;
    }

    deletedAssetIds.push(...group.map((asset) => asset.id));
  }

  if (deletedAssetIds.length) {
    const { error: markError } = await supabase
      .from("storage_assets")
      .update({
        status: "deleted",
        deleted_at: now,
      })
      .in("id", deletedAssetIds);

    if (markError) {
      console.error(
        "Falha ao marcar ativos excluídos:",
        markError.message,
      );

      return NextResponse.json(
        {
          ok: false,
          error: "asset_deletion_registration_failed",
        },
        { status: 500 },
      );
    }
  }

  const { data: purgeRows, error: purgeError } =
    await supabase.rpc(
      "purge_expired_monitoria_metadata",
      { p_limit: 500 },
    );

  if (purgeError) {
    console.error(
      "Falha ao expurgar metadados:",
      purgeError.message,
    );

    return NextResponse.json(
      {
        ok: false,
        error: "metadata_purge_failed",
        storageObjectsDeleted: deletedAssetIds.length,
      },
      { status: 500 },
    );
  }

  const purge = Array.isArray(purgeRows)
    ? purgeRows[0]
    : purgeRows;

  return NextResponse.json(
    {
      ok: true,
      scanned: assets.length,
      storageObjectsDeleted: deletedAssetIds.length,
      failedBuckets: failures,
      eventsDeleted: Number(purge?.events_deleted ?? 0),
      analysisJobsDeleted: Number(purge?.jobs_deleted ?? 0),
      assetRowsDeleted: Number(
        purge?.asset_rows_deleted ?? 0,
      ),
      executedAt: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
