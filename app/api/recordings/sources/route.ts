import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  siteId: z.string().uuid(),
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
      { ok: false, error: "invalid_recording_source" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("id", body.siteId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return NextResponse.json(
      { ok: false, error: "site_not_found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const { data: camera, error } = await supabase
    .from("cameras")
    .insert({
      organization_id: organization.id,
      site_id: body.siteId,
      name: body.name,
      description:
        "Fonte do MonitorIA alimentada por gravações selecionadas no dispositivo.",
      source_kind: "local_recording",
      status: "pending",
      analysis_plan_code: "basic",
      pairing_status: "unpaired",
      setup_named_at: now,
      health_intelligence_enabled: false,
      last_seen_at: null,
    })
    .select("id,name,site_id,analysis_plan_code,status,source_kind")
    .single();

  if (error || !camera) {
    console.error("Falha ao criar fonte de gravações:", error?.message);
    return NextResponse.json(
      { ok: false, error: "recording_source_create_failed" },
      { status: 500 },
    );
  }

  await supabase.from("audit_logs").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "recording.source_created",
    entity_type: "camera",
    entity_id: String(camera.id),
    metadata: {
      source_kind: "local_recording",
      site_id: body.siteId,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      source: {
        id: String(camera.id),
        name: String(camera.name),
        siteId: String(camera.site_id),
        planCode: String(camera.analysis_plan_code),
        profileReady: false,
        entitlement: {
          accessSource: "blocked",
          monitoringAllowed: false,
          periodStartsAt: null,
          periodEndsAt: null,
          reason: "plan_not_selected",
          clipEnabled: false,
        },
        quota: {
          limitSeconds: 0,
          usedSeconds: 0,
          remainingSeconds: 0,
        },
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
