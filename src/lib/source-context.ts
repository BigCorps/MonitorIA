import { createClient } from "@/src/lib/supabase/server";
import {
  EMPTY_SOURCE_CONTEXT,
  sourceModeFromCounts,
  type OrganizationSourceContext,
} from "@/src/lib/source-mode";

export async function getOrganizationSourceContext(
  organizationId: string,
): Promise<OrganizationSourceContext> {
  const supabase = await createClient();

  const [cameraResult, agentResult] = await Promise.all([
    supabase
      .from("cameras")
      .select("id,source_kind,status")
      .eq("organization_id", organizationId)
      .neq("status", "disabled"),
    supabase
      .from("agents")
      .select("id,status")
      .eq("organization_id", organizationId)
      .neq("status", "disabled"),
  ]);

  if (cameraResult.error) {
    console.error(
      "Falha ao identificar fontes visuais da organização:",
      cameraResult.error.message,
    );
  }

  if (agentResult.error) {
    console.error(
      "Falha ao identificar computadores da organização:",
      agentResult.error.message,
    );
  }

  if (cameraResult.error && agentResult.error) {
    return EMPTY_SOURCE_CONTEXT;
  }

  const cameras = cameraResult.data ?? [];
  const agents = agentResult.data ?? [];

  const liveCameras = cameras.filter(
    (camera: any) => camera.source_kind !== "local_recording",
  );
  const recordings = cameras.filter(
    (camera: any) => camera.source_kind === "local_recording",
  );

  return {
    mode: sourceModeFromCounts(
      liveCameras.length,
      recordings.length,
    ),
    liveCameraCount: liveCameras.length,
    recordingEnvironmentCount: recordings.length,
    liveOnlineCount: liveCameras.filter(
      (camera: any) => camera.status === "online",
    ).length,
    agentCount: agents.length,
    agentOnlineCount: agents.filter(
      (agent: any) => agent.status === "online",
    ).length,
  };
}
