"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
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
  /**
   * Durante o contexto, aponta para a primeira câmera que ainda precisa
   * receber nome ou ter o perfil aprovado. Depois disso, cai para a primeira
   * câmera da organização apenas para manter compatibilidade com usos antigos.
   */
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
        .select("id,camera_id")
        .eq("organization_id", organization.id)
        .eq("is_active", true),
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

  const activeProfileCameraIds = new Set(
    (profilesResult.data ?? []).map((row) =>
      String((row as { camera_id: string }).camera_id),
    ),
  );

  // Nome e contexto agora formam uma única etapa. O guia permanece nela até
  // TODAS as câmeras terem nome confirmado e perfil ativo. Assim um cliente
  // com duas ou mais câmeras não termina o onboarding configurando só a primeira.
  const contextCamera = list.find(
    (row) =>
      !row.setup_named_at ||
      !activeProfileCameraIds.has(String(row.id)),
  );

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

  // Depois que o trial começou uma vez, nunca oferecemos outro período grátis.
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
