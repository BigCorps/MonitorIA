import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  assetId: z.string().uuid(),
  byteSize: z.number().int().min(1).max(100 * 1024 * 1024),
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
  durationSeconds: z.number().min(1).max(310),
}).strict();

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return NextResponse.json(
      { ok: false, error: "not_authorized" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_clip_completion" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("storage_assets")
    .select("id,bucket,storage_path,status")
    .eq("id", body.assetId)
    .eq("organization_id", organization.id)
    .eq("kind", "preserved_clip")
    .maybeSingle();

  if (!asset) {
    return NextResponse.json(
      { ok: false, error: "clip_asset_not_found" },
      { status: 404 },
    );
  }

  // O upload já ocorreu diretamente para a URL assinada do Storage.
  // Não trazemos o vídeo de volta pela Vercel: isso duplicaria banda e memória.
  const { error } = await admin
    .from("storage_assets")
    .update({
      status: "ready",
      byte_size: body.byteSize,
      content_sha256: body.contentSha256.toLowerCase(),
      mime_type: "video/mp4",
      deleted_at: null,
    })
    .eq("id", body.assetId);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "clip_completion_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, assetId: body.assetId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
