import type { NextRequest } from "next/server";
import { authenticateAgent, type AuthenticatedAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type AuthenticatedAgentCamera = {
  agent: AuthenticatedAgent;
  camera: {
    id: string;
    name: string;
    organizationId: string;
    siteId: string;
    status: string;
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
    .select("id,name,organization_id,site_id,status")
    .eq("id", cameraId)
    .eq("organization_id", agent.organizationId)
    .eq("site_id", agent.siteId)
    .maybeSingle();

  if (cameraError || !camera) return null;

  return {
    agent,
    camera: {
      id: String(camera.id),
      name: String(camera.name),
      organizationId: String(camera.organization_id),
      siteId: String(camera.site_id),
      status: String(camera.status),
    },
    supabase,
  };
}
