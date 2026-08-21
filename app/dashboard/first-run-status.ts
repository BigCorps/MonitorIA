"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { ensureSalesTrialForOrganization } from "@/src/lib/sales-trial-context";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type FirstRunStage = 1 | 2 | 3 | 4 | 5;
export type FirstRunPhase =
  | "connect"
  | "discover"
  | "context"
  | "commercial"
  | "done";

export type FirstRunStatus = {
  stage: FirstRunStage;
  phase: FirstRunPhase;
  cameras: number;
  camerasOnline: number;
  firstCameraId: string | null;
};

const TRIAL_ALREADY_USED_STATUSES = new Set([
  "running",
  "capture_completed",
  "exploration",
  "converted",
  "expired",
  "purged",
]);

export async function getFirstRunStatusAction(): Promise<FirstRunStatus> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  const empty: FirstRunStatus = {
    stage: 1,
    phase: "connect",
    cameras: 0,
    camerasOnline: 0,
    firstCameraId: null,
  };

  if (!organization) return empty;

  // Se a conta nasceu por /lead e o usuário voltou pelo dashboard após confirmar
  // o e-mail, recupera o convite antes de decidir se o passo 4 é 1h ou 24h.
  await ensureSalesTrialForOrganization(user, organization.id);

  const supabase = createAdminClient();

  const [agentsResult, camerasResult, profilesResult, trialResult] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .neq("status", "disabled"),
      supabase
        .from("cameras")
        .select("id,status,setup_named_at,created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("camera_profiles")
        .select("id,camera_id,created_at")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("trial_runs")
        .select("status")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const list = (camerasResult.data ?? []) as Array<{
    id: string;
    status: string | null;
    setup_named_at: string | null;
    created_at: string;
  }>;

  const online = list.filter(
    (row) => String(row.status ?? "") === "online",
  );

  if ((agentsResult.count ?? 0) === 0) {
    return { ...empty, stage: 1, phase: "connect" };
  }

  if (list.length === 0) {
    return {
      stage: 2,
      phase: "discover",
      cameras: 0,
      camerasOnline: 0,
      firstCameraId: null,
    };
  }

  const activeProfileCreatedAtByCamera = new Map<string, number>();

  for (const row of profilesResult.data ?? []) {
    const cameraId = String((row as { camera_id: string }).camera_id);
    if (activeProfileCreatedAtByCamera.has(cameraId)) continue;

    const createdAt = Date.parse(
      String((row as { created_at: string }).created_at ?? ""),
    );

    if (Number.isFinite(createdAt)) {
      activeProfileCreatedAtByCamera.set(cameraId, createdAt);
    }
  }

  const contextCamera = list.find((row) => {
    if (!row.setup_named_at) return true;

    const namedAt = Date.parse(String(row.setup_named_at));
    const activeProfileCreatedAt =
      activeProfileCreatedAtByCamera.get(String(row.id));

    if (!Number.isFinite(namedAt) || activeProfileCreatedAt === undefined) {
      return true;
    }

    return activeProfileCreatedAt < namedAt;
  });

  if (contextCamera) {
    return {
      stage: 3,
      phase: "context",
      cameras: list.length,
      camerasOnline: online.length,
      firstCameraId: String(contextCamera.id),
    };
  }

  const latestTrialStatus = String(
    (trialResult.data as { status?: string } | null)?.status ?? "",
  );

  if (TRIAL_ALREADY_USED_STATUSES.has(latestTrialStatus)) {
    return {
      stage: 5,
      phase: "done",
      cameras: list.length,
      camerasOnline: online.length,
      firstCameraId: list[0] ? String(list[0].id) : null,
    };
  }

  const { count: allowedCount } = await supabase
    .from("camera_entitlements")
    .select("camera_id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("monitoring_allowed", true);

  if ((allowedCount ?? 0) === 0) {
    return {
      stage: 4,
      phase: "commercial",
      cameras: list.length,
      camerasOnline: online.length,
      firstCameraId: list[0] ? String(list[0].id) : null,
    };
  }

  return {
    stage: 5,
    phase: "done",
    cameras: list.length,
    camerasOnline: online.length,
    firstCameraId: list[0] ? String(list[0].id) : null,
  };
}
