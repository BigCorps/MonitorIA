import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { CAMERA_ANALYSIS_PLANS } from "@/src/lib/analysis-plans";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CAMERAS_PER_AGENT = 32;

const BodySchema = z.object({
  suggestedName: z.string().trim().max(160).nullable().optional(),
  vendor: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
});

function cleanLabel(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cameraName(
  body: z.infer<typeof BodySchema>,
  ordinal: number,
) {
  const suggested = cleanLabel(body.suggestedName);
  const equipment = [cleanLabel(body.vendor), cleanLabel(body.model)]
    .filter(Boolean)
    .join(" ");
  const base = suggested || equipment || `Câmera ${ordinal}`;

  return base.slice(0, 160);
}

/**
 * Cria a representação no painel somente depois que o Agent local validou
 * um stream. IP, usuário, senha e URL RTSP nunca são enviados ao servidor.
 */
export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);

  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: z.infer<typeof BodySchema>;

  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = createAdminClient();
  const { count, error: countError } = await supabase
    .from("agent_cameras")
    .select("camera_id", { count: "exact", head: true })
    .eq("agent_id", agent.id)
    .eq("enabled", true);

  if (countError) {
    console.error("Falha ao contar câmeras do Agent:", countError.message);
    return NextResponse.json(
      { ok: false, error: "camera_registration_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cameraCount = count ?? 0;
  if (cameraCount >= MAX_CAMERAS_PER_AGENT) {
    return NextResponse.json(
      { ok: false, error: "agent_camera_limit_reached" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Se o cliente já cadastrou várias câmeras no painel, reutiliza primeiro
  // as que ainda não pertencem a nenhum Agent. Assim um único código inicia
  // o computador e a descoberta completa o restante sem criar duplicatas.
  const { data: waitingCameras, error: waitingError } = await supabase
    .from("cameras")
    .select("id,name,pairing_status")
    .eq("organization_id", agent.organizationId)
    .eq("site_id", agent.siteId)
    .in("pairing_status", ["unpaired", "pairing"])
    .order("created_at", { ascending: true })
    .limit(MAX_CAMERAS_PER_AGENT);

  if (waitingError) {
    console.error(
      "Falha ao procurar câmeras aguardando Agent:",
      waitingError.message,
    );
  }

  const waitingIds = (waitingCameras ?? []).map((camera: any) =>
    String(camera.id),
  );
  const mappedIds = new Set<string>();

  if (waitingIds.length > 0) {
    const { data: mappings, error: mappingLookupError } = await supabase
      .from("agent_cameras")
      .select("camera_id")
      .in("camera_id", waitingIds)
      .eq("enabled", true);

    if (mappingLookupError) {
      console.error(
        "Falha ao conferir vínculos existentes:",
        mappingLookupError.message,
      );
    } else {
      for (const mapping of mappings ?? []) {
        mappedIds.add(String((mapping as any).camera_id));
      }
    }
  }

  const waiting = (waitingCameras ?? []).find(
    (camera: any) => !mappedIds.has(String(camera.id)),
  ) as { id: string; name: string } | undefined;

  if (waiting) {
    const { error: reuseMappingError } = await supabase
      .from("agent_cameras")
      .insert({
        agent_id: agent.id,
        camera_id: waiting.id,
        enabled: true,
      });

    if (!reuseMappingError) {
      const pairedAt = new Date().toISOString();
      const { error: reuseCameraError } = await supabase
        .from("cameras")
        .update({ pairing_status: "paired", paired_at: pairedAt })
        .eq("id", waiting.id)
        .eq("organization_id", agent.organizationId);

      if (!reuseCameraError) {
        // Códigos ainda não usados para esta câmera deixam de ser válidos,
        // pois ela acabou de ser vinculada automaticamente a este Agent.
        await supabase
          .from("agent_pairing_codes")
          .update({ revoked_at: pairedAt })
          .eq("camera_id", waiting.id)
          .is("used_at", null)
          .is("revoked_at", null);

        return NextResponse.json(
          {
            ok: true,
            camera: {
              id: String(waiting.id),
              name: String(waiting.name),
            },
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }

      await supabase
        .from("agent_cameras")
        .delete()
        .eq("agent_id", agent.id)
        .eq("camera_id", waiting.id);
    }

    console.error(
      "Falha ao reutilizar câmera aguardando pareamento:",
      reuseMappingError?.message ?? "não foi possível atualizar a câmera",
    );
  }

  const plan = CAMERA_ANALYSIS_PLANS.basic;
  const equipment = [cleanLabel(body.vendor), cleanLabel(body.model)]
    .filter(Boolean)
    .join(" ");

  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .insert({
      organization_id: agent.organizationId,
      site_id: agent.siteId,
      name: cameraName(body, cameraCount + 1),
      description: equipment
        ? `Encontrada automaticamente pelo Agent · ${equipment}`.slice(0, 500)
        : "Encontrada automaticamente pelo Agent",
      status: "pending",
      pairing_status: "paired",
      paired_at: new Date().toISOString(),
      analysis_plan_code: "basic",
      monitoring_goals: [],
      capture_interval_seconds: plan.captureIntervalSeconds,
      consolidation_interval_seconds: plan.consolidationIntervalSeconds,
      motion_start_threshold: plan.motionStartThreshold,
      motion_continue_threshold: plan.motionContinueThreshold,
      event_close_after_seconds: plan.eventCloseAfterSeconds,
      motion_start_consecutive_frames: plan.motionStartConsecutiveFrames,
      motion_end_consecutive_frames: plan.motionEndConsecutiveFrames,
      motion_cooldown_seconds: plan.motionCooldownSeconds,
      motion_adaptive_enabled: true,
      motion_overlay_mask: "auto",
      monitoring_schedule: { mode: "always" },
    })
    .select("id,name")
    .single();

  if (cameraError || !camera) {
    console.error(
      "Falha ao cadastrar câmera descoberta:",
      cameraError?.message,
    );
    return NextResponse.json(
      { ok: false, error: "camera_registration_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { error: mappingError } = await supabase
    .from("agent_cameras")
    .insert({
      agent_id: agent.id,
      camera_id: camera.id,
      enabled: true,
    });

  if (mappingError) {
    console.error(
      "Falha ao vincular câmera descoberta:",
      mappingError.message,
    );
    await supabase.from("cameras").delete().eq("id", camera.id);

    return NextResponse.json(
      { ok: false, error: "camera_registration_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      camera: {
        id: String(camera.id),
        name: String(camera.name),
      },
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
