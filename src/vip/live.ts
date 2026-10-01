import { createAdminClient } from "@/src/lib/supabase/admin";

export type VipLiveCamera = {
  id: string;
  name: string;
  siteName: string;
  participantStatus: string;
  cameraStatus: string;
  agentStatus: string | null;
  lastHeartbeatAt: string | null;
};

export type VipTrialLiveSnapshot = {
  projectId: string;
  projectName: string;
  projectStatus: string;
  salesOperatorId: string;
  organizationId: string;
  trialId: string;
  trialStatus: string;
  durationMinutes: number;
  captureStartedAt: string | null;
  captureEndsAt: string | null;
  captureCompletedAt: string | null;
  explorationEndsAt: string | null;
  eventCount: number;
  cameraCount: number;
  camerasOnline: number;
  agentsOnline: number;
  assistantIncluded: number;
  assistantUsed: number;
  assistantRemaining: number;
  cameras: VipLiveCamera[];
};

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getVipTrialLiveSnapshotByProject(
  projectId: string,
): Promise<VipTrialLiveSnapshot | null> {
  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from("vip_projects")
    .select("id,name,status,organization_id,sales_operator_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(`vip_live_project_unavailable:${projectError.message}`);
  }
  if (!project?.organization_id) return null;

  const { data: trial, error: trialError } = await admin
    .from("trial_runs")
    .select(
      "id,status,duration_minutes,capture_started_at,capture_ends_at,capture_completed_at,exploration_ends_at,interaction_limit,interactions_used",
    )
    .eq("vip_project_id", projectId)
    .maybeSingle();

  if (trialError) {
    throw new Error(`vip_live_trial_unavailable:${trialError.message}`);
  }
  if (!trial) return null;

  const trialId = String(trial.id);
  const organizationId = String(project.organization_id);

  const [participantsResult, eventsResult, allowanceResult] = await Promise.all([
    admin
      .from("trial_run_cameras")
      .select("camera_id,status,agent_id")
      .eq("trial_run_id", trialId)
      .neq("status", "removed")
      .order("created_at", { ascending: true }),
    admin
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("trial_run_id", trialId)
      .is("deleted_at", null),
    admin
      .from("assistant_allowances")
      .select("included_interactions,used_interactions")
      .eq("organization_id", organizationId)
      .eq("source", "trial")
      .eq("source_reference_id", trialId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (participantsResult.error) {
    throw new Error(
      `vip_live_participants_unavailable:${participantsResult.error.message}`,
    );
  }
  if (eventsResult.error) {
    throw new Error(`vip_live_events_unavailable:${eventsResult.error.message}`);
  }
  if (allowanceResult.error) {
    throw new Error(
      `vip_live_allowance_unavailable:${allowanceResult.error.message}`,
    );
  }

  const participantRows = participantsResult.data ?? [];
  const cameraIds = participantRows.map((row) => String(row.camera_id));
  const agentIds = [
    ...new Set(
      participantRows
        .map((row) => (row.agent_id ? String(row.agent_id) : null))
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const [camerasResult, agentsResult] = await Promise.all([
    cameraIds.length
      ? admin
          .from("cameras")
          .select("id,name,status,site:sites(name)")
          .eq("organization_id", organizationId)
          .in("id", cameraIds)
      : Promise.resolve({ data: [], error: null }),
    agentIds.length
      ? admin
          .from("agents")
          .select("id,status,last_heartbeat_at")
          .eq("organization_id", organizationId)
          .in("id", agentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (camerasResult.error) {
    throw new Error(`vip_live_cameras_unavailable:${camerasResult.error.message}`);
  }
  if (agentsResult.error) {
    throw new Error(`vip_live_agents_unavailable:${agentsResult.error.message}`);
  }

  const cameraById = new Map(
    (camerasResult.data ?? []).map((row: any) => [String(row.id), row]),
  );
  const agentById = new Map(
    (agentsResult.data ?? []).map((row: any) => [String(row.id), row]),
  );

  const cameras: VipLiveCamera[] = participantRows.map((participant: any) => {
    const camera = cameraById.get(String(participant.camera_id)) as any;
    const agent = participant.agent_id
      ? (agentById.get(String(participant.agent_id)) as any)
      : null;
    const site = one(camera?.site as { name?: string } | { name?: string }[] | null);

    return {
      id: String(participant.camera_id),
      name: String(camera?.name ?? "Câmera"),
      siteName: String(site?.name ?? "Local"),
      participantStatus: String(participant.status ?? "selected"),
      cameraStatus: String(camera?.status ?? "unknown"),
      agentStatus: agent ? String(agent.status ?? "unknown") : null,
      lastHeartbeatAt: agent?.last_heartbeat_at
        ? String(agent.last_heartbeat_at)
        : null,
    };
  });

  const assistantIncluded = Number(
    allowanceResult.data?.included_interactions ?? trial.interaction_limit ?? 0,
  );
  const assistantUsed = Number(
    allowanceResult.data?.used_interactions ?? trial.interactions_used ?? 0,
  );

  return {
    projectId: String(project.id),
    projectName: String(project.name),
    projectStatus: String(project.status),
    salesOperatorId: String(project.sales_operator_id),
    organizationId,
    trialId,
    trialStatus: String(trial.status),
    durationMinutes: Number(trial.duration_minutes ?? 60),
    captureStartedAt: trial.capture_started_at
      ? String(trial.capture_started_at)
      : null,
    captureEndsAt: trial.capture_ends_at ? String(trial.capture_ends_at) : null,
    captureCompletedAt: trial.capture_completed_at
      ? String(trial.capture_completed_at)
      : null,
    explorationEndsAt: trial.exploration_ends_at
      ? String(trial.exploration_ends_at)
      : null,
    eventCount: eventsResult.count ?? 0,
    cameraCount: cameras.length,
    camerasOnline: cameras.filter((camera) => camera.cameraStatus === "online").length,
    agentsOnline: new Set(
      participantRows
        .filter((participant: any) => {
          if (!participant.agent_id) return false;
          const agent = agentById.get(String(participant.agent_id)) as any;
          return String(agent?.status ?? "") === "online";
        })
        .map((participant: any) => String(participant.agent_id)),
    ).size,
    assistantIncluded,
    assistantUsed,
    assistantRemaining: Math.max(0, assistantIncluded - assistantUsed),
    cameras,
  };
}

export async function getVipTrialLiveSnapshotByTrialId(
  trialId: string,
): Promise<VipTrialLiveSnapshot | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_runs")
    .select("vip_project_id")
    .eq("id", trialId)
    .maybeSingle();

  if (error) {
    throw new Error(`vip_live_trial_lookup_failed:${error.message}`);
  }
  if (!data?.vip_project_id) return null;

  return getVipTrialLiveSnapshotByProject(String(data.vip_project_id));
}
