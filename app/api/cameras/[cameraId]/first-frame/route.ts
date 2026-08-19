import {
  NextResponse,
  type NextRequest,
} from "next/server";
import {
  getAuthenticatedUser,
} from "@/src/lib/auth";
import {
  getCurrentOrganization,
} from "@/src/lib/dashboard-data";
import {
  createAdminClient,
} from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      cameraId: string;
    }>;
  },
) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { ok: false },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json(
      { ok: false },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const { cameraId } = await context.params;
  const admin = createAdminClient();

  const { data: camera } = await admin
    .from("cameras")
    .select("id")
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!camera) {
    return NextResponse.json(
      { ok: false },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const { data: asset, error } = await admin
    .from("storage_assets")
    .select("id,bucket,storage_path,captured_at")
    .eq("organization_id", organization.id)
    .eq("camera_id", cameraId)
    .eq("status", "ready")
    .is("deleted_at", null)
    .in("kind", ["analysis_frame", "event_keyframe"])
    .order("captured_at", { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error || !asset) {
    return NextResponse.json(
      { ok: false, pending: true },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const signed = await admin.storage
    .from(String(asset.bucket))
    .createSignedUrl(String(asset.storage_path), 5 * 60);

  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json(
      { ok: false },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const response = NextResponse.redirect(signed.data.signedUrl, 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
