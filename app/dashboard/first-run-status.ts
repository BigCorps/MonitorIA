"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type FirstRunStage = 1 | 2 | 3 | 4 | 5;
export type FirstRunPhase =
  | "connect"
  | "discover"
  | "name"
  | "profile"
  | "commercial"
  | "done";

export type FirstRunStatus = {
  stage: FirstRunStage;
  phase: FirstRunPhase;
  cameras: number;
  camerasOnline: number;
  firstCameraId: string | null;
};

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

  const [agentsResult, camerasResult, profilesResult] = await Promise.all([
    supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .neq("status", "disabled"),
    supabase
      .from("cameras")
      .select("id,status,setup_named_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("camera_profiles")
      .select("id,camera_id", { count: "exact" })
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  const list = (camerasResult.data ?? []) as unknown as Record<string, unknown>[];
  const online = list.filter((row) => String(row.status ?? "") === "online");
  const firstCameraId = online[0]
    ? String(online[0].id)
    : list[0]
      ? String(list[0].id)
      : null;

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

  const unnamed = list.filter((row) => !row.setup_named_at).length;
  if (unnamed > 0) {
    return {
      stage: 3,
      phase: "name",
      cameras: list.length,
      camerasOnline: online.length,
      firstCameraId,
    };
  }

  const activeProfileCameraIds = new Set(
    (profilesResult.data ?? []).map((row) => String((row as { camera_id: string }).camera_id)),
  );
  const firstNamedCameraHasProfile =
    firstCameraId !== null && activeProfileCameraIds.has(firstCameraId);

  // O teste gratuito existente exige uma câmera online e com perfil ativo.
  // Portanto o contexto visual vem antes de iniciar o relógio das 24 horas.
  if (!firstNamedCameraHasProfile) {
    return {
      stage: 4,
      phase: "profile",
      cameras: list.length,
      camerasOnline: online.length,
      firstCameraId,
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
      firstCameraId,
    };
  }

  return {
    stage: 5,
    phase: "done",
    cameras: list.length,
    camerasOnline: online.length,
    firstCameraId,
  };
}
