import type { NextRequest } from "next/server";
import {
  authenticateAgent,
  type AuthenticatedAgent,
} from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";

export type AuthenticatedAgentCamera = {
  agent: AuthenticatedAgent;
  camera: {
    id: string;
    name: string;
    organizationId: string;
    siteId: string;
    status: string;
    analysisPlanCode: AnalysisPlanCode;
    visualStateEnabled: boolean;
    shortMemoryEnabled: boolean;
    shortMemoryWindowMinutes: number;
    continuityMinSimilarity: number;
    intelligenceMode: string;
    sceneDensity: string;
    multiEntityEnabled: boolean;
    vehicleMemoryEnabled: boolean;
    complexityRoutingEnabled: boolean;
    verificationEnabled: boolean;
    complexityStrongThreshold: number;
    verificationThreshold: number;
    vehicleMemoryWindowMinutes: number;
    vehicleSimilarityThreshold: number;
  };
  supabase: ReturnType<typeof createAdminClient>;
};

export async function authenticateAgentCamera(
  request: NextRequest,
  cameraId: string,
): Promise<AuthenticatedAgentCamera | null> {
  const agent = await authenticateAgent(request);
  if (!agent) return null;

  const supabase = createAdminClient();

  const { data: link, error: linkError } = await supabase
    .from("agent_cameras")
    .select("camera_id")
    .eq("agent_id", agent.id)
    .eq("camera_id", cameraId)
    .eq("enabled", true)
    .maybeSingle();

  if (linkError || !link) return null;

  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select(
      "id,name,organization_id,site_id,status,analysis_plan_code,visual_state_enabled,short_memory_enabled,short_memory_window_minutes,continuity_min_similarity,intelligence_mode,scene_density,multi_entity_enabled,vehicle_memory_enabled,complexity_routing_enabled,verification_enabled,complexity_strong_threshold,verification_threshold,vehicle_memory_window_minutes,vehicle_similarity_threshold",
    )
    .eq("id", cameraId)
    .eq("organization_id", agent.organizationId)
    .eq("site_id", agent.siteId)
    .maybeSingle();

  if (cameraError || !camera) return null;

  const { data: entitlement } = await supabase
    .from("camera_entitlements")
    .select("plan_code,monitoring_allowed")
    .eq("organization_id", agent.organizationId)
    .eq("camera_id", cameraId)
    .maybeSingle();

  const effectivePlan =
    entitlement?.plan_code ?? camera.analysis_plan_code;
  const plan =
    effectivePlan === "basic" ||
    effectivePlan === "intensive"
      ? effectivePlan
      : "standard";

  return {
    agent,
    camera: {
      id: String(camera.id),
      name: String(camera.name),
      organizationId: String(camera.organization_id),
      siteId: String(camera.site_id),
      status: String(camera.status),
      analysisPlanCode: plan,
      visualStateEnabled: Boolean(camera.visual_state_enabled),
      shortMemoryEnabled: Boolean(camera.short_memory_enabled),
      shortMemoryWindowMinutes: Number(
        camera.short_memory_window_minutes ?? 15,
      ),
      continuityMinSimilarity: Number(
        camera.continuity_min_similarity ?? 0.72,
      ),
      intelligenceMode: String(camera.intelligence_mode ?? "auto"),
      sceneDensity: String(camera.scene_density ?? "normal"),
      multiEntityEnabled: Boolean(camera.multi_entity_enabled ?? true),
      vehicleMemoryEnabled: Boolean(camera.vehicle_memory_enabled ?? true),
      complexityRoutingEnabled: Boolean(
        camera.complexity_routing_enabled ?? true,
      ),
      verificationEnabled: Boolean(camera.verification_enabled ?? true),
      complexityStrongThreshold: Number(
        camera.complexity_strong_threshold ?? 65,
      ),
      verificationThreshold: Number(
        camera.verification_threshold ?? 78,
      ),
      vehicleMemoryWindowMinutes: Number(
        camera.vehicle_memory_window_minutes ?? 60,
      ),
      vehicleSimilarityThreshold: Number(
        camera.vehicle_similarity_threshold ?? 0.76,
      ),
    },
    supabase,
  };
}
