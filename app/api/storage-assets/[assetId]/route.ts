import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import {
  consumeRateLimit,
  rateLimitHeaders,
} from "@/src/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  const user = await requireAuthenticatedUser();
  const { assetId } = await context.params;

  if (!z.string().uuid().safeParse(assetId).success) {
    return NextResponse.json(
      { ok: false, error: "invalid_asset_id" },
      { status: 400 },
    );
  }

  let rateLimit;
  try {
    rateLimit = await consumeRateLimit({
      scope: "signed-asset-url",
      subject: user.id,
      limit: 120,
      windowSeconds: 60,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "rate_limit_unavailable" },
      { status: 503 },
    );
  }

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "too_many_requests" },
      { status: 429, headers: rateLimitHeaders(rateLimit) },
    );
  }

  const supabase = await createClient();
  const { data: asset, error } = await supabase
    .from("storage_assets")
    .select("id,bucket,storage_path,status,deleted_at")
    .eq("id", assetId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !asset) {
    return NextResponse.json(
      { ok: false, error: "asset_not_found" },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  const { data: signed, error: signedError } =
    await admin.storage
      .from(String(asset.bucket))
      .createSignedUrl(String(asset.storage_path), 5 * 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: "asset_unavailable" },
      { status: 503 },
    );
  }

  const response = NextResponse.redirect(
    signed.signedUrl,
    307,
  );
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
