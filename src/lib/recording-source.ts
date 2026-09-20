import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { normalizeAnalysisPlan } from "@/src/lib/analysis-plans";

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function authorizeRecordingCamera(
  cameraId: string,
  options: { requireManager?: boolean } = {},
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { error: "authentication_required", status: 401 } as const;
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return { error: "organization_not_found", status: 404 } as const;
  }

  if (
    options.requireManager &&
    !["owner", "admin"].includes(organization.role)
  ) {
    return { error: "not_authorized", status: 403 } as const;
  }

  const supabase = createAdminClient();
  const { data: camera, error } = await supabase
    .from("cameras")
    .select(`
      id,
      organization_id,
      site_id,
      name,
      description,
      status,
      source_kind,
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
      visual_state_enabled,
      short_memory_enabled,
      short_memory_window_minutes,
      customer_memory_hours,
      staff_memory_hours,
      interaction_gap_minutes,
      continuity_min_similarity,
      staff_match_min_similarity,
      intelligence_mode,
      scene_density,
      multi_entity_enabled,
      vehicle_memory_enabled,
      complexity_routing_enabled,
      verification_enabled,
      complexity_strong_threshold,
      verification_threshold,
      vehicle_memory_window_minutes,
      vehicle_similarity_threshold,
      site:sites(name,timezone)
    `)
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .eq("source_kind", "local_recording")
    .maybeSingle();

  if (error || !camera) {
    return { error: "recording_source_not_found", status: 404 } as const;
  }

  const site = relationOne(
    camera.site as
      | { name: string; timezone: string }
      | Array<{ name: string; timezone: string }>
      | null,
  );

  if (!site) {
    return { error: "recording_site_not_found", status: 404 } as const;
  }

  const { data: entitlement, error: entitlementError } = await supabase
    .from("camera_entitlements")
    .select(
      "camera_id,access_source,monitoring_allowed,plan_code,period_starts_at,period_ends_at,grace_ends_at,metadata_retention_days,long_term_keyframes,temporary_frame_days,maximum_analysis_frames,maximum_escalation_percent,clip_enabled,clip_duration_seconds,clip_retention_days,assistant_access_allowed,reason,trial_run_id,capture_ends_at",
    )
    .eq("organization_id", organization.id)
    .eq("camera_id", cameraId)
    .maybeSingle();

  if (entitlementError) {
    return { error: "recording_entitlement_unavailable", status: 500 } as const;
  }

  const effectivePlan = normalizeAnalysisPlan(
    entitlement?.plan_code ?? camera.analysis_plan_code,
  );

  return {
    user,
    organization,
    supabase,
    entitlement,
    camera: {
      id: String(camera.id),
      organizationId: String(camera.organization_id),
      siteId: String(camera.site_id),
      siteName: String(site.name),
      timezone: String(site.timezone ?? "America/Sao_Paulo"),
      name: String(camera.name),
      description: String(camera.description ?? ""),
      status: String(camera.status ?? "pending"),
      sourceKind: "local_recording" as const,
      analysisPlanCode: effectivePlan,
      captureIntervalSeconds: Number(camera.capture_interval_seconds ?? 1),
      consolidationIntervalSeconds: Number(
        camera.consolidation_interval_seconds ?? 10,
      ),
      motionStartThreshold: Number(camera.motion_start_threshold ?? 1.25),
      motionContinueThreshold: Number(
        camera.motion_continue_threshold ?? 0.6,
      ),
      eventCloseAfterSeconds: Number(camera.event_close_after_seconds ?? 20),
      motionAdaptiveEnabled: camera.motion_adaptive_enabled !== false,
      motionOverlayMask: String(camera.motion_overlay_mask ?? "auto"),
      motionStartConsecutiveFrames: Number(
        camera.motion_start_consecutive_frames ?? 3,
      ),
      motionEndConsecutiveFrames: Number(
        camera.motion_end_consecutive_frames ?? 6,
      ),
      motionCooldownSeconds: Number(camera.motion_cooldown_seconds ?? 10),
      monitoringSchedule:
        camera.monitoring_schedule &&
        typeof camera.monitoring_schedule === "object"
          ? camera.monitoring_schedule
          : { mode: "always" },
      monitoringGoals: Array.isArray(camera.monitoring_goals)
        ? camera.monitoring_goals.map(String)
        : [],
      visualStateEnabled: camera.visual_state_enabled !== false,
      shortMemoryEnabled: camera.short_memory_enabled !== false,
      shortMemoryWindowMinutes: Number(
        camera.short_memory_window_minutes ?? 20,
      ),
      customerMemoryHours: Number(camera.customer_memory_hours ?? 2),
      staffMemoryHours: Number(camera.staff_memory_hours ?? 12),
      interactionGapMinutes: Number(camera.interaction_gap_minutes ?? 10),
      continuityMinSimilarity: Number(
        camera.continuity_min_similarity ?? 0.72,
      ),
      staffMatchMinSimilarity: Number(
        camera.staff_match_min_similarity ?? 0.76,
      ),
      intelligenceMode: String(camera.intelligence_mode ?? "balanced"),
      sceneDensity: String(camera.scene_density ?? "normal"),
      multiEntityEnabled: camera.multi_entity_enabled !== false,
      vehicleMemoryEnabled: camera.vehicle_memory_enabled !== false,
      complexityRoutingEnabled:
        camera.complexity_routing_enabled !== false,
      verificationEnabled: camera.verification_enabled !== false,
      complexityStrongThreshold: Number(
        camera.complexity_strong_threshold ?? 70,
      ),
      verificationThreshold: Number(
        camera.verification_threshold ?? 60,
      ),
      vehicleMemoryWindowMinutes: Number(
        camera.vehicle_memory_window_minutes ?? 30,
      ),
      vehicleSimilarityThreshold: Number(
        camera.vehicle_similarity_threshold ?? 0.72,
      ),
    },
  } as const;
}

export async function getRecordingSourceSummaries(
  organizationId: string,
) {
  const supabase = createAdminClient();
  const [{ data: cameras, error }, { data: entitlements }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("cameras")
        .select("id,name,site_id,analysis_plan_code,status,created_at,site:sites(name)")
        .eq("organization_id", organizationId)
        .eq("source_kind", "local_recording")
        .order("created_at", { ascending: true }),
      supabase
        .from("camera_entitlements")
        .select(
          "camera_id,access_source,monitoring_allowed,plan_code,period_starts_at,period_ends_at,reason,clip_enabled",
        )
        .eq("organization_id", organizationId),
      supabase
        .from("camera_profiles")
        .select("camera_id,id")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
    ]);

  if (error) throw new Error(error.message);

  const entitlementByCamera = new Map(
    (entitlements ?? []).map((row: any) => [String(row.camera_id), row]),
  );
  const activeProfileByCamera = new Set(
    (profiles ?? []).map((row: any) => String(row.camera_id)),
  );

  const result = [];

  for (const row of cameras ?? []) {
    const id = String((row as any).id);
    const entitlement = entitlementByCamera.get(id) as any;
    const periodStart = entitlement?.period_starts_at
      ? String(entitlement.period_starts_at)
      : null;
    const periodEnd = entitlement?.period_ends_at
      ? String(entitlement.period_ends_at)
      : null;
    const accessSource = String(entitlement?.access_source ?? "blocked");
    const quotaLimitSeconds =
      accessSource === "trial"
        ? 600
        : ["subscription", "grace_period", "legacy"].includes(accessSource)
          ? 2_592_000
          : 0;

    let usedSeconds = 0;
    if (periodStart && periodEnd) {
      const { data: sessions } = await supabase
        .from("recording_sessions")
        .select("status,reserved_seconds,processed_seconds")
        .eq("camera_id", id)
        .eq("quota_period_start", periodStart)
        .eq("quota_period_end", periodEnd);

      usedSeconds = (sessions ?? []).reduce(
        (sum: number, session: any) => {
          const active = ["reserved", "processing"].includes(
            String(session.status),
          );

          return (
            sum +
            Number(
              active
                ? session.reserved_seconds ?? 0
                : session.processed_seconds ?? 0,
            )
          );
        },
        0,
      );
    }

    result.push({
      id,
      name: String((row as any).name),
      siteId: String((row as any).site_id),
      siteName: String(relationOne((row as any).site)?.name ?? "Local"),
      status: String((row as any).status ?? "pending"),
      planCode: normalizeAnalysisPlan(
        entitlement?.plan_code ?? (row as any).analysis_plan_code,
      ),
      profileReady: activeProfileByCamera.has(id),
      entitlement: {
        accessSource,
        monitoringAllowed: Boolean(entitlement?.monitoring_allowed),
        periodStartsAt: periodStart,
        periodEndsAt: periodEnd,
        reason: String(entitlement?.reason ?? "plan_not_selected"),
        clipEnabled: Boolean(entitlement?.clip_enabled),
      },
      quota: {
        limitSeconds: quotaLimitSeconds,
        usedSeconds,
        remainingSeconds: Math.max(quotaLimitSeconds - usedSeconds, 0),
      },
    });
  }

  return result;
}
