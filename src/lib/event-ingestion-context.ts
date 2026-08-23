import { CameraProfileSchema } from "@/src/contracts/camera-profile";
import { normalizeAnalysisPlan } from "@/src/lib/analysis-plans";
import { getVisionPlan } from "@/src/vision/plans";
import { buildVisionPromptHash, VISION_PROMPT_VERSION } from "@/src/vision/prompt";

export type FrozenEventAnalysisContext = {
  schemaVersion: "monitoria-event-context/1";
  planCode: "basic" | "standard" | "intensive";
  profileId: string;
  profileVersion: number;
  promptVersion: number;
  promptHash: string;
  cameraProfile: unknown;
  retention: {
    temporaryFrameDays: number;
    keyframeDays: number;
    metadataDays: number;
    clipEnabled: boolean;
    clipDurationSeconds: number | null;
    clipRetentionDays: number | null;
  };
  features: {
    shortMemoryEnabled: boolean;
    vehicleMemoryEnabled: boolean;
  };
};

function boundedDays(value: unknown, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function nullableBoundedInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

export function applyEffectivePlanToFrozenContext(
  context: FrozenEventAnalysisContext,
  input: {
    planCode: "basic" | "standard" | "intensive";
    retentionSnapshot?: Record<string, unknown> | null;
  },
): FrozenEventAnalysisContext {
  const visionPlan = getVisionPlan(input.planCode);
  const snapshot = input.retentionSnapshot ?? null;

  return {
    ...context,
    planCode: input.planCode,
    promptHash: buildVisionPromptHash(
      context.cameraProfile as any,
      visionPlan.mode,
    ),
    retention: {
      ...context.retention,
      temporaryFrameDays: boundedDays(
        snapshot?.temporaryFrameDays,
        context.retention.temporaryFrameDays,
        30,
      ),
      metadataDays: boundedDays(
        snapshot?.metadataRetentionDays,
        context.retention.metadataDays,
        3650,
      ),
      clipEnabled:
        typeof snapshot?.clipEnabled === "boolean"
          ? snapshot.clipEnabled
          : input.planCode === "intensive" && context.retention.clipEnabled,
      clipDurationSeconds: nullableBoundedInteger(
        snapshot?.clipDurationSeconds ?? context.retention.clipDurationSeconds,
        5,
        310,
      ),
      clipRetentionDays: nullableBoundedInteger(
        snapshot?.clipRetentionDays ?? context.retention.clipRetentionDays,
        1,
        365,
      ),
    },
  };
}

/**
 * Congela tudo que pode mudar a interpretação/custo do acontecimento ANTES do
 * ACK. O processamento pesado pode acontecer segundos ou minutos depois sem
 * pegar um perfil novo no meio do caminho.
 */
export async function buildFrozenEventAnalysisContext(input: {
  authenticated: any;
  cameraId: string;
  planCodeOverride?: "basic" | "standard" | "intensive";
  retentionSnapshotOverride?: Record<string, unknown> | null;
}): Promise<FrozenEventAnalysisContext> {
  const { authenticated, cameraId } = input;
  const supabase = authenticated.supabase;
  const planCode = input.planCodeOverride ??
    normalizeAnalysisPlan(authenticated.camera.analysisPlanCode);
  const visionPlan = getVisionPlan(planCode);

  const [profileResult, siteResult, retentionResult] = await Promise.all([
    supabase
      .from("camera_profiles")
      .select("id,version,environment_description,monitoring_goals,ignore_instructions")
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("sites")
      .select("timezone")
      .eq("id", authenticated.camera.siteId)
      .eq("organization_id", authenticated.camera.organizationId)
      .maybeSingle(),
    supabase
      .from("retention_policies")
      .select("temporary_frame_days,keyframe_days,metadata_days")
      .eq("organization_id", authenticated.camera.organizationId)
      .maybeSingle(),
  ]);

  const profile = profileResult.data;
  if (profileResult.error || !profile) throw new Error("active_camera_profile_required");
  if (siteResult.error || !siteResult.data) throw new Error("camera_site_unavailable");

  const [zonesResult, visualResult, staffResult] = await Promise.all([
    supabase
      .from("camera_zones")
      .select("id,name,zone_type,person_role_hint,polygon,description")
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_profile_id", profile.id)
      .order("sort_order", { ascending: true }),
    authenticated.camera.visualStateEnabled
      ? supabase
          .from("camera_visual_entities")
          .select("id,name,entity_type,polygon,state_definitions,primary_operational_marker,min_confidence,reliability")
          .eq("organization_id", authenticated.camera.organizationId)
          .eq("camera_id", cameraId)
          .eq("camera_profile_id", profile.id)
          .eq("enabled", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    authenticated.camera.shortMemoryEnabled
      ? supabase
          .from("camera_staff_profiles")
          .select("id,label,description,appearance_signature,zone_ids,min_similarity")
          .eq("organization_id", authenticated.camera.organizationId)
          .eq("camera_id", cameraId)
          .eq("enabled", true)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (zonesResult.error) throw new Error("active_zones_unavailable");
  if (visualResult.error) throw new Error("visual_entities_unavailable");
  if (staffResult.error) throw new Error("staff_profiles_unavailable");

  const cameraProfile = CameraProfileSchema.parse({
    cameraId,
    profileVersion: Number(profile.version),
    environmentDescription: String(profile.environment_description),
    monitoringGoals: Array.isArray(profile.monitoring_goals)
      ? profile.monitoring_goals.map((goal: unknown) => String(goal))
      : [],
    ignoreInstructions: Array.isArray(profile.ignore_instructions)
      ? profile.ignore_instructions.map((item: unknown) => String(item))
      : [],
    intelligence: {
      mode: authenticated.camera.intelligenceMode,
      sceneDensity: authenticated.camera.sceneDensity,
      multiEntityEnabled: authenticated.camera.multiEntityEnabled,
      vehicleMemoryEnabled: authenticated.camera.vehicleMemoryEnabled,
      complexityRoutingEnabled: authenticated.camera.complexityRoutingEnabled,
      verificationEnabled: authenticated.camera.verificationEnabled,
      strongThreshold: authenticated.camera.complexityStrongThreshold,
      verificationThreshold: authenticated.camera.verificationThreshold,
      vehicleMemoryWindowMinutes: authenticated.camera.vehicleMemoryWindowMinutes,
      vehicleSimilarityThreshold: authenticated.camera.vehicleSimilarityThreshold,
    },
    timezone: String(siteResult.data.timezone),
    zones: (zonesResult.data ?? []).map((zone: any) => ({
      id: String(zone.id),
      name: String(zone.name),
      type: String(zone.zone_type),
      personRoleHint: String(zone.person_role_hint ?? "none"),
      polygon: zone.polygon,
      description: String(zone.description ?? ""),
    })),
    staffProfiles: (staffResult.data ?? []).map((staff: any) => ({
      id: String(staff.id),
      label: String(staff.label),
      description: String(staff.description),
      appearanceSignature: staff.appearance_signature ?? {},
      zoneIds: Array.isArray(staff.zone_ids) ? staff.zone_ids.map(String) : [],
      minSimilarity: Number(staff.min_similarity ?? 0.74),
    })),
    visualEntities: (visualResult.data ?? []).map((entity: any) => ({
      id: String(entity.id),
      name: String(entity.name),
      type: String(entity.entity_type),
      polygon: entity.polygon,
      stateDefinitions: entity.state_definitions,
      primaryOperationalMarker: Boolean(entity.primary_operational_marker),
      minConfidence: Number(entity.min_confidence ?? 0.82),
      reliability: String(entity.reliability ?? "medium"),
    })),
  });

  return {
    schemaVersion: "monitoria-event-context/1",
    planCode,
    profileId: String(profile.id),
    profileVersion: Number(profile.version),
    promptVersion: VISION_PROMPT_VERSION,
    promptHash: buildVisionPromptHash(cameraProfile, visionPlan.mode),
    cameraProfile,
    retention: {
      temporaryFrameDays: boundedDays(
        input.retentionSnapshotOverride?.temporaryFrameDays ?? retentionResult.data?.temporary_frame_days,
        3,
        30,
      ),
      keyframeDays: boundedDays(retentionResult.data?.keyframe_days, 90, 3650),
      metadataDays: boundedDays(
        input.retentionSnapshotOverride?.metadataRetentionDays ?? retentionResult.data?.metadata_days,
        90,
        3650,
      ),
      clipEnabled: Boolean(
        input.retentionSnapshotOverride?.clipEnabled ?? (planCode === "intensive"),
      ),
      clipDurationSeconds: nullableBoundedInteger(
        input.retentionSnapshotOverride?.clipDurationSeconds,
        5,
        310,
      ),
      clipRetentionDays: nullableBoundedInteger(
        input.retentionSnapshotOverride?.clipRetentionDays,
        1,
        365,
      ),
    },
    features: {
      shortMemoryEnabled: Boolean(authenticated.camera.shortMemoryEnabled),
      vehicleMemoryEnabled: Boolean(authenticated.camera.vehicleMemoryEnabled),
    },
  };
}
