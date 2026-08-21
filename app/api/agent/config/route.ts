import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { openCredentials } from "@/src/lib/discovery-crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Intervalo que o Agent deve usar entre consultas de configuração.
 *
 * Sem pedido de busca, 20s. É mais que os 60s antigos porque o cliente que
 * clica em "Procurar câmeras" não pode esperar um minuto para a tela sair do
 * lugar. Com busca em andamento, cai para 5s: o painel mostra progresso real
 * e cada etapa precisa chegar rápido.
 */
const IDLE_POLL_SECONDS = 20;
const ACTIVE_POLL_SECONDS = 5;

type PendingDiscovery = {
  id: string;
  username: string;
  password: string;
  cameraCountHint: number;
};

/**
 * Marca como expirados os pedidos que passaram do prazo e entrega ao Agent o
 * pedido pendente, se houver.
 *
 * A troca de `pending` para `running` acontece aqui, condicionada ao estado
 * anterior. Duas consultas seguidas do mesmo Agent não disparam duas buscas.
 */
async function claimDiscoveryRequest(
  supabase: ReturnType<typeof createAdminClient>,
  agentId: string,
): Promise<{ pending: PendingDiscovery | null; active: boolean }> {
  const nowIso = new Date().toISOString();

  await supabase
    .from("discovery_runs")
    .update({
      status: "expired",
      finished_at: nowIso,
      username: null,
      credentials_sealed: null,
      failure_code: "expired",
      failure_message:
        "A busca demorou demais e foi encerrada. Você pode tentar de novo.",
    })
    .eq("agent_id", agentId)
    .in("status", ["pending", "running"])
    .lt("expires_at", nowIso);

  const { data: claimed, error: claimError } = await supabase
    .from("discovery_runs")
    .update({
      status: "running",
      started_at: nowIso,
      progress_step: "starting",
      progress_percent: 5,
      progress_message: "O programa da loja recebeu o pedido e vai começar.",
      progress_updated_at: nowIso,
    })
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .select("id,username,credentials_sealed,camera_count_hint")
    .maybeSingle();

  if (claimError) {
    console.error(
      "Falha ao entregar pedido de busca ao Agent:",
      claimError.message,
    );
    return { pending: null, active: false };
  }

  if (claimed) {
    const credentials = openCredentials(
      (claimed as { credentials_sealed: string | null }).credentials_sealed,
    );

    if (!credentials) {
      // Sem credencial legível não há busca possível. Encerra com texto de
      // tela e guarda o motivo técnico só no registro.
      await supabase
        .from("discovery_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          username: null,
          credentials_sealed: null,
          failure_code: "credentials_unreadable",
          failure_message:
            "Não conseguimos usar o usuário e a senha informados. " +
            "Preencha de novo e tente mais uma vez.",
          failure_detail:
            "credentials_sealed ausente ou não decifrável na entrega ao Agent.",
        })
        .eq("id", String((claimed as { id: string }).id));

      return { pending: null, active: false };
    }

    return {
      pending: {
        id: String((claimed as { id: string }).id),
        username: credentials.username,
        password: credentials.password,
        cameraCountHint: Number(
          (claimed as { camera_count_hint: number }).camera_count_hint ?? 4,
        ),
      },
      active: true,
    };
  }

  const { count } = await supabase
    .from("discovery_runs")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("status", "running");

  return { pending: null, active: (count ?? 0) > 0 };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scheduleValue(value: unknown) {
  const object = objectValue(value);

  if (object.mode !== "weekly") {
    return { mode: "always" as const };
  }

  const weekly = Array.isArray(object.weekly)
    ? object.weekly.flatMap((entry) => {
        const item = objectValue(entry);
        const day = Number(item.day);
        const start = String(item.start ?? "");
        const end = String(item.end ?? "");

        if (
          !Number.isInteger(day) ||
          day < 0 ||
          day > 6 ||
          !/^\d{2}:\d{2}$/.test(start) ||
          !/^\d{2}:\d{2}$/.test(end)
        ) {
          return [];
        }

        return [{ day, start, end }];
      })
    : [];

  return {
    mode: "weekly" as const,
    weekly,
    outsideMode:
      object.outsideMode === "significant_only"
        ? ("significant_only" as const)
        : ("off" as const),
  };
}

function polygonsValue(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];

    const points = polygon.flatMap((point) => {
      const item = objectValue(point);
      const x = Number(item.x);
      const y = Number(item.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
      ) {
        return [];
      }

      return [{ x, y }];
    });

    return points.length >= 3 ? [points] : [];
  });
}

type EntitlementRow = {
  camera_id: string;
  trial_run_id: string | null;
  access_source: string;
  monitoring_allowed: boolean;
  plan_code: string | null;
  period_starts_at: string | null;
  period_ends_at: string | null;
  grace_ends_at: string | null;
  capture_ends_at: string | null;
  exploration_ends_at: string | null;
  purge_after: string | null;
  metadata_retention_days: number | null;
  long_term_keyframes: number | null;
  temporary_frame_days: number | null;
  maximum_analysis_frames: number | null;
  maximum_escalation_percent: number | null;
  clip_enabled: boolean;
  clip_duration_seconds: number | null;
  clip_retention_days: number | null;
  assistant_access_allowed: boolean;
  enforcement_enabled: boolean;
  reason: string;
};

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_cameras")
    .select(`
      camera:cameras(
        id,
        name,
        description,
        status,
        analysis_plan_code,
        capture_interval_seconds,
        consolidation_interval_seconds,
        motion_start_threshold,
        motion_continue_threshold,
        event_close_after_seconds,
        motion_adaptive_enabled,
        motion_overlay_mask,
        motion_start_consecutive_frames,
        motion_end_consecutive_frames,
        motion_cooldown_seconds,
        monitoring_schedule,
        monitoring_goals,
        site:sites(timezone)
      )
    `)
    .eq("agent_id", agent.id)
    .eq("enabled", true);

  if (error) {
    console.error(
      "Falha ao carregar configuração do Agent:",
      error.message,
    );
    return NextResponse.json(
      { ok: false, error: "configuration_unavailable" },
      { status: 500 },
    );
  }

  const cameraRows = (data ?? []).flatMap((row: any) => {
    const relation = row.camera;
    const camera = Array.isArray(relation) ? relation[0] : relation;
    return camera ? [camera] : [];
  });

  const cameraIds = cameraRows.map((camera: any) => String(camera.id));

  const [profilesResult, entitlementResult] = cameraIds.length
    ? await Promise.all([
        supabase
          .from("camera_profiles")
          .select("id,camera_id,version")
          .in("camera_id", cameraIds)
          .eq("is_active", true),
        supabase
          .from("camera_entitlements")
          .select(
            "camera_id,trial_run_id,access_source,monitoring_allowed,plan_code,period_starts_at,period_ends_at,grace_ends_at,capture_ends_at,exploration_ends_at,purge_after,metadata_retention_days,long_term_keyframes,temporary_frame_days,maximum_analysis_frames,maximum_escalation_percent,clip_enabled,clip_duration_seconds,clip_retention_days,assistant_access_allowed,enforcement_enabled,reason",
          )
          .eq("organization_id", agent.organizationId)
          .in("camera_id", cameraIds),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (profilesResult.error) {
    console.error(
      "Falha ao carregar perfis ativos do Agent:",
      profilesResult.error.message,
    );
    return NextResponse.json(
      { ok: false, error: "active_profiles_unavailable" },
      { status: 500 },
    );
  }

  if (entitlementResult.error) {
    console.error(
      "Falha ao carregar permissões comerciais do Agent:",
      entitlementResult.error.message,
    );
    return NextResponse.json(
      { ok: false, error: "entitlements_unavailable" },
      { status: 500 },
    );
  }

  const profilesByCamera = new Map<
    string,
    { id: string; version: number }
  >();

  for (const profile of profilesResult.data ?? []) {
    profilesByCamera.set(String((profile as any).camera_id), {
      id: String((profile as any).id),
      version: Number((profile as any).version),
    });
  }

  const entitlementsByCamera = new Map<string, EntitlementRow>();
  for (const entitlement of entitlementResult.data ?? []) {
    entitlementsByCamera.set(
      String((entitlement as any).camera_id),
      entitlement as EntitlementRow,
    );
  }

  const profileIds = [...profilesByCamera.values()].map(
    (profile) => profile.id,
  );

  const { data: ignoreZones, error: ignoreError } = profileIds.length
    ? await supabase
        .from("camera_zones")
        .select("camera_profile_id,polygon")
        .in("camera_profile_id", profileIds)
        .eq("zone_type", "ignore")
    : { data: [], error: null };

  if (ignoreError) {
    console.error(
      "Falha ao carregar zonas ignoradas:",
      ignoreError.message,
    );
  }

  const ignoreByProfile = new Map<string, unknown[]>();

  for (const row of ignoreZones ?? []) {
    const profileId = String((row as any).camera_profile_id);
    const list = ignoreByProfile.get(profileId) ?? [];
    list.push((row as any).polygon);
    ignoreByProfile.set(profileId, list);
  }

  const cameras = cameraRows.map((camera: any) => {
    const cameraId = String(camera.id);
    const activeProfile = profilesByCamera.get(cameraId) ?? null;
    const entitlement = entitlementsByCamera.get(cameraId);
    const siteRelation = camera.site;
    const site = Array.isArray(siteRelation)
      ? siteRelation[0]
      : siteRelation;

    const overlay =
      camera.motion_overlay_mask === "none" ||
      camera.motion_overlay_mask === "top-left" ||
      camera.motion_overlay_mask === "top-right" ||
      camera.motion_overlay_mask === "bottom-left" ||
      camera.motion_overlay_mask === "bottom-right"
        ? camera.motion_overlay_mask
        : "auto";

    const effectivePlan =
      entitlement?.plan_code === "basic" ||
      entitlement?.plan_code === "intensive"
        ? entitlement.plan_code
        : entitlement?.plan_code === "standard"
          ? "standard"
          : camera.analysis_plan_code === "basic" ||
              camera.analysis_plan_code === "intensive"
            ? camera.analysis_plan_code
            : "standard";

    const monitoringAllowed = Boolean(
      entitlement?.monitoring_allowed,
    );

    return {
      id: cameraId,
      name: String(camera.name),
      description: String(camera.description ?? ""),
      status: String(camera.status),
      plan: effectivePlan,
      timezone: String(site?.timezone ?? "America/Sao_Paulo"),
      captureIntervalSeconds: Number(
        camera.capture_interval_seconds,
      ),
      consolidationIntervalSeconds: Number(
        camera.consolidation_interval_seconds,
      ),
      motionStartThreshold: Number(camera.motion_start_threshold),
      motionContinueThreshold: Number(
        camera.motion_continue_threshold,
      ),
      eventCloseAfterSeconds: Number(
        camera.event_close_after_seconds,
      ),
      motionAdaptiveEnabled: camera.motion_adaptive_enabled !== false,
      motionOverlayMask: overlay,
      motionStartConsecutiveFrames: Number(
        camera.motion_start_consecutive_frames ?? 3,
      ),
      motionEndConsecutiveFrames: Number(
        camera.motion_end_consecutive_frames ?? 6,
      ),
      motionCooldownSeconds: Number(
        camera.motion_cooldown_seconds ?? 10,
      ),
      monitoringSchedule: scheduleValue(camera.monitoring_schedule),
      motionIgnorePolygons: activeProfile
        ? polygonsValue(ignoreByProfile.get(activeProfile.id) ?? [])
        : [],
      monitoringGoals: Array.isArray(camera.monitoring_goals)
        ? camera.monitoring_goals.map((goal: unknown) => String(goal))
        : [],
      monitoringEnabled: Boolean(activeProfile) && monitoringAllowed,
      activeProfileId: activeProfile?.id ?? null,
      activeProfileVersion: activeProfile?.version ?? null,
      accessSource: entitlement?.access_source ?? "blocked",
      monitoringAllowed,
      entitlementReason:
        entitlement?.reason ?? "entitlement_unavailable",
      enforcementEnabled:
        entitlement?.enforcement_enabled ?? true,
      trialRunId: entitlement?.trial_run_id ?? null,
      periodStartsAt: entitlement?.period_starts_at ?? null,
      periodEndsAt: entitlement?.period_ends_at ?? null,
      graceEndsAt: entitlement?.grace_ends_at ?? null,
      captureEndsAt: entitlement?.capture_ends_at ?? null,
      explorationEndsAt: entitlement?.exploration_ends_at ?? null,
      purgeAfter: entitlement?.purge_after ?? null,
      metadataRetentionDays:
        entitlement?.metadata_retention_days ?? null,
      longTermKeyframes:
        entitlement?.long_term_keyframes ?? null,
      temporaryFrameDays:
        entitlement?.temporary_frame_days ?? null,
      maximumAnalysisFrames:
        entitlement?.maximum_analysis_frames ?? null,
      maximumEscalationPercent:
        entitlement?.maximum_escalation_percent ?? null,
      clipEnabled: entitlement?.clip_enabled ?? false,
      clipDurationSeconds:
        entitlement?.clip_duration_seconds ?? null,
      clipRetentionDays:
        entitlement?.clip_retention_days ?? null,
      assistantAccessAllowed:
        entitlement?.assistant_access_allowed ?? false,
    };
  });

  const discovery = await claimDiscoveryRequest(supabase, agent.id);

  return NextResponse.json(
    {
      ok: true,
      configVersion: 4,
      agent: { id: agent.id, name: agent.name },
      cameras,
      discovery: discovery.pending,
      pollSeconds: discovery.active ? ACTIVE_POLL_SECONDS : IDLE_POLL_SECONDS,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
