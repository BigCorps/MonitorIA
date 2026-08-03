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
      "id,name,organization_id,site_id,status,analysis_plan_code,visual_state_enabled",
    )
    .eq("id", cameraId)
    .eq("organization_id", agent.organizationId)
    .eq("site_id", agent.siteId)
    .maybeSingle();

  if (cameraError || !camera) return null;

  const plan =
    camera.analysis_plan_code === "basic" ||
    camera.analysis_plan_code === "intensive"
      ? camera.analysis_plan_code
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
    },
    supabase,
  };
}
