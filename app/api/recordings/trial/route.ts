import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  cameraId: z.string().uuid(),
  planCode: z.enum(["basic", "standard", "intensive"]),
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
      { ok: false, error: "invalid_trial_request" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: camera } = await admin
    .from("cameras")
    .select("id,source_kind")
    .eq("id", body.cameraId)
    .eq("organization_id", organization.id)
    .eq("source_kind", "local_recording")
    .maybeSingle();

  if (!camera) {
    return NextResponse.json(
      { ok: false, error: "recording_source_not_found" },
      { status: 404 },
    );
  }

  const { data: existing } = await admin
    .from("trial_runs")
    .select(
      "id,camera_id,status,capture_started_at,capture_ends_at,exploration_ends_at,selected_plan_code",
    )
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    existing?.status === "running" &&
    String(existing.camera_id) === body.cameraId
  ) {
    return NextResponse.json(
      { ok: true, duplicate: true, trial: existing },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = await createClient();
  const { data: prepared, error: prepareError } = await supabase.rpc(
    "prepare_monitoria_trial",
    {
      p_organization_id: organization.id,
      p_camera_id: body.cameraId,
      p_plan_code: body.planCode,
    },
  );

  if (prepareError) {
    const message = prepareError.message ?? "";
    const status = message.includes("trial_already_used") ? 409 : 400;
    return NextResponse.json(
      { ok: false, error: message || "trial_prepare_failed" },
      { status },
    );
  }

  const preparedValue = Array.isArray(prepared) ? prepared[0] : prepared;
  const preparedReady =
    preparedValue?.status === "ready" ||
    preparedValue?.readiness?.ready === true;

  if (!preparedReady) {
    const reason = String(preparedValue?.reason ?? "");

    return NextResponse.json(
      {
        ok: false,
        error:
          reason === "trial_selection_locked"
            ? "trial_selection_locked"
            : "recording_source_not_ready",
        message:
          reason === "trial_selection_locked"
            ? "Já existe um teste em andamento nesta conta."
            : "Confirme o ambiente desta gravação antes de iniciar o teste.",
        readiness: preparedValue?.readiness ?? null,
      },
      { status: 409 },
    );
  }

  const { data: started, error: startError } = await supabase.rpc(
    "start_monitoria_trial",
    {
      p_organization_id: organization.id,
    },
  );

  if (startError) {
    return NextResponse.json(
      { ok: false, error: startError.message || "trial_start_failed" },
      { status: 400 },
    );
  }

  const trial = Array.isArray(started) ? started[0] : started;

  return NextResponse.json(
    {
      ok: true,
      duplicate: false,
      trial,
      recordingLimitSeconds: 600,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
