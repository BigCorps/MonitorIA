import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ assetId: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  await requireAuthenticatedUser();
  const { assetId } = await context.params;

  if (!z.string().uuid().safeParse(assetId).success) {
    return NextResponse.json(
      { ok: false, error: "invalid_asset_id" },
      { status: 400 },
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
