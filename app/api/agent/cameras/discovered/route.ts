import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { CAMERA_ANALYSIS_PLANS } from "@/src/lib/analysis-plans";
import {
  chooseReusableDiscoveryCamera,
  findUniqueStrongDiscoveryMatch,
  mappingIsOperational,
  type DiscoveryCameraMapping,
  type DiscoveryInventoryCamera,
} from "@/src/camera/discovery-review";
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

function relationValue(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object"
      ? (first as Record<string, unknown>)
      : null;
  }

  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Cria a representação no painel somente depois que o Agent local validou
 * um stream. IP, usuário, senha e URL RTSP nunca são enviados ao servidor.
 *
 * Gate de Robustez 2:
 * - reaproveita câmeras órfãs do mesmo Local mesmo se pairing_status ficou
 *   incoerentemente em "paired";
 * - trata vínculo enabled de Agent já disabled como vínculo obsoleto;
 * - bloqueia criação quando existe uma correspondência forte e única em
 *   outro Local ou em outro Agent operacional;
 * - nunca apaga, move ou renomeia uma câmera existente para "limpar" dados.
 *
 * Como o Agent 1.0.3 mantém URL/fingerprint do stream somente no host local,
 * fabricante/modelo/nome são usados apenas como evidência conservadora. Uma
 * semelhança ambígua nunca autoriza alteração automática.
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
  const signal = {
    name: cleanLabel(body.suggestedName) || null,
    vendor: cleanLabel(body.vendor) || null,
    model: cleanLabel(body.model) || null,
  };

  const [cameraResult, agentResult] = await Promise.all([
    supabase
      .from("cameras")
      .select(
        "id,site_id,name,description,status,pairing_status,source_kind,created_at,last_seen_at,setup_named_at,site:sites(id,name)",
      )
      .eq("organization_id", agent.organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agents")
      .select("id,site_id,name,status")
      .eq("organization_id", agent.organizationId),
  ]);

  if (cameraResult.error || agentResult.error) {
    console.error(
      "Falha ao preparar inventário para descoberta:",
      cameraResult.error?.message ?? agentResult.error?.message,
    );
    return NextResponse.json(
      { ok: false, error: "camera_registration_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cameraRows = cameraResult.data ?? [];
  const cameraIds = cameraRows.map((row) => String(row.id));
  const { data: mappingRows, error: mappingLookupError } = cameraIds.length
    ? await supabase
        .from("agent_cameras")
        .select("agent_id,camera_id,enabled,created_at,updated_at")
        .in("camera_id", cameraIds)
    : { data: [], error: null };

  if (mappingLookupError) {
    console.error(
      "Falha ao conferir vínculos existentes:",
      mappingLookupError.message,
    );
    return NextResponse.json(
      { ok: false, error: "camera_registration_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const agentsById = new Map(
    (agentResult.data ?? []).map((row) => [String(row.id), row]),
  );
  const mappingsByCamera = new Map<string, DiscoveryCameraMapping[]>();

  for (const row of mappingRows ?? []) {
    const cameraId = String(row.camera_id);
    const mappedAgent = agentsById.get(String(row.agent_id));
    const list = mappingsByCamera.get(cameraId) ?? [];
    list.push({
      agentId: String(row.agent_id),
      agentSiteId: mappedAgent?.site_id ? String(mappedAgent.site_id) : null,
      agentName: mappedAgent?.name ? String(mappedAgent.name) : null,
      agentStatus: mappedAgent?.status ? String(mappedAgent.status) : null,
      enabled: row.enabled === true,
      createdAt: row.created_at ? String(row.created_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    });
    mappingsByCamera.set(cameraId, list);
  }

  const inventory: DiscoveryInventoryCamera[] = cameraRows.map((row) => {
    const site = relationValue(row.site);
    return {
      id: String(row.id),
      siteId: String(row.site_id),
      siteName: String(site?.name ?? "Local"),
      name: String(row.name ?? "Câmera"),
      description: row.description ? String(row.description) : null,
      status: row.status ? String(row.status) : null,
      pairingStatus: row.pairing_status ? String(row.pairing_status) : null,
      sourceKind: row.source_kind ? String(row.source_kind) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
      setupNamedAt: row.setup_named_at ? String(row.setup_named_at) : null,
      mappings: mappingsByCamera.get(String(row.id)) ?? [],
    };
  });

  const strong = findUniqueStrongDiscoveryMatch(inventory, signal);

  if (strong) {
    const strongCamera = strong.camera;
    const operationalMappings = strongCamera.mappings.filter(mappingIsOperational);
    const currentMapping = operationalMappings.find(
      (mapping) => mapping.agentId === agent.id,
    );

    if (strongCamera.siteId !== agent.siteId) {
      return NextResponse.json(
        {
          ok: false,
          error: "camera_linked_other_site",
          cameraId: strongCamera.id,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (currentMapping) {
      // O registro já é deste Agent. Isso pode acontecer se o cofre local foi
      // reconstruído ou se duas tentativas chegaram muito próximas. Devolver o
      // mesmo ID permite ao Agent 1.0.3 restaurar o stream sem criar cópia.
      return NextResponse.json(
        {
          ok: true,
          camera: {
            id: strongCamera.id,
            name: strongCamera.name,
          },
          reused: true,
        },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (operationalMappings.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "camera_already_registered",
          cameraId: strongCamera.id,
        },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

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

  const sameSite = inventory.filter((camera) => camera.siteId === agent.siteId);
  const reusable = chooseReusableDiscoveryCamera(sameSite, signal);

  if (reusable) {
    const previousCurrentMapping = reusable.mappings.find(
      (mapping) => mapping.agentId === agent.id,
    );

    const mappingMutation = previousCurrentMapping
      ? await supabase
          .from("agent_cameras")
          .update({ enabled: true })
          .eq("agent_id", agent.id)
          .eq("camera_id", reusable.id)
      : await supabase.from("agent_cameras").insert({
          agent_id: agent.id,
          camera_id: reusable.id,
          enabled: true,
        });

    if (!mappingMutation.error) {
      const pairedAt = new Date().toISOString();
      const { error: reuseCameraError } = await supabase
        .from("cameras")
        .update({ pairing_status: "paired", paired_at: pairedAt })
        .eq("id", reusable.id)
        .eq("organization_id", agent.organizationId)
        .eq("site_id", agent.siteId);

      if (!reuseCameraError) {
        const staleAgentIds = reusable.mappings
          .filter(
            (mapping) =>
              mapping.agentId !== agent.id &&
              mapping.enabled &&
              mapping.agentStatus === "disabled",
          )
          .map((mapping) => mapping.agentId);

        if (staleAgentIds.length > 0) {
          const { error: staleMappingError } = await supabase
            .from("agent_cameras")
            .update({ enabled: false })
            .eq("camera_id", reusable.id)
            .in("agent_id", staleAgentIds);

          if (staleMappingError) {
            console.warn(
              "Câmera reaproveitada, mas vínculo obsoleto não pôde ser desabilitado:",
              staleMappingError.message,
            );
          }
        }

        // Códigos ainda não usados deixam de ser válidos, pois a câmera já
        // está ligada ao Agent correto deste Local.
        await supabase
          .from("agent_pairing_codes")
          .update({ revoked_at: pairedAt })
          .eq("camera_id", reusable.id)
          .is("used_at", null)
          .is("revoked_at", null);

        return NextResponse.json(
          {
            ok: true,
            camera: {
              id: reusable.id,
              name: reusable.name,
            },
            reused: true,
          },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      }

      // Rollback somente do vínculo que esta própria tentativa acabou de
      // criar/habilitar. Nenhuma câmera de produção é apagada nesta limpeza.
      if (previousCurrentMapping) {
        await supabase
          .from("agent_cameras")
          .update({ enabled: previousCurrentMapping.enabled })
          .eq("agent_id", agent.id)
          .eq("camera_id", reusable.id);
      } else {
        await supabase
          .from("agent_cameras")
          .delete()
          .eq("agent_id", agent.id)
          .eq("camera_id", reusable.id);
      }
    }

    console.error(
      "Falha ao reutilizar câmera existente durante descoberta:",
      mappingMutation.error?.message ?? "não foi possível atualizar a câmera",
    );

    return NextResponse.json(
      { ok: false, error: "camera_registration_failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
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
    // Este DELETE é apenas rollback da linha criada segundos antes nesta
    // requisição; nunca é usado como mecanismo de limpeza de duplicatas.
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
      reused: false,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
