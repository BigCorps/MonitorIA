"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

const UUID = z.string().uuid();

function go(projectId: string, kind: "message" | "error", message: string): never {
  redirect(`/vip/dashboard/projects/${encodeURIComponent(projectId)}?${kind}=${encodeURIComponent(message)}`);
}

async function manager(projectId: string) {
  const parsed = UUID.safeParse(projectId);
  if (!parsed.success) redirect("/vip/dashboard");
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  if (!["owner", "admin"].includes(organization.role)) go(parsed.data, "error", "Somente proprietários e administradores podem alterar o Projeto VIP.");
  const admin = createAdminClient();
  const { data } = await admin.from("vip_projects").select("id").eq("id", parsed.data).eq("organization_id", organization.id).eq("status", "active").maybeSingle();
  if (!data) redirect("/vip/dashboard");
  return { user, admin, projectId: parsed.data };
}

export async function assignVipCameraAction(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const camera = UUID.safeParse(String(formData.get("camera_id") ?? ""));
  const ctx = await manager(projectId);
  if (!camera.success) go(projectId, "error", "Câmera inválida.");
  const { data, error } = await ctx.admin.rpc("assign_vip_camera_v1", {
    p_project_id: ctx.projectId, p_camera_id: camera.data, p_actor_user_id: ctx.user.id,
  });
  if (error) {
    const message = error.message.includes("capacity")
      ? "O Projeto já atingiu a quantidade contratada de câmeras."
      : error.message.includes("another_project")
        ? "Esta câmera já pertence a outro Projeto VIP ativo."
        : "Não foi possível adicionar a câmera ao Projeto VIP.";
    go(projectId, "error", message);
  }
  const result = data as Record<string, unknown> | null;
  revalidatePath("/vip/dashboard");
  revalidatePath(`/vip/dashboard/projects/${projectId}`);
  go(projectId, "message", `Câmera adicionada. ${Number(result?.remainingCapacity ?? 0)} vaga(s) restante(s).`);
}

export async function removeVipCameraAction(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const camera = UUID.safeParse(String(formData.get("camera_id") ?? ""));
  const ctx = await manager(projectId);
  if (!camera.success) go(projectId, "error", "Câmera inválida.");
  const { error } = await ctx.admin.rpc("remove_vip_camera_v1", {
    p_project_id: ctx.projectId, p_camera_id: camera.data, p_actor_user_id: ctx.user.id,
  });
  if (error) go(projectId, "error", "Não foi possível remover esta câmera do Projeto VIP.");
  revalidatePath("/vip/dashboard");
  revalidatePath(`/vip/dashboard/projects/${projectId}`);
  go(projectId, "message", "Câmera removida do Projeto VIP.");
}

export async function setVipFeatureAction(formData: FormData) {
  const projectId = String(formData.get("project_id") ?? "");
  const code = String(formData.get("feature_code") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const ctx = await manager(projectId);
  if (!/^[a-z0-9_]{2,80}$/.test(code)) go(projectId, "error", "Recurso beta inválido.");
  const { error } = await ctx.admin.rpc("set_vip_project_feature_v1", {
    p_project_id: ctx.projectId, p_feature_code: code, p_enabled: enabled, p_config: {}, p_actor_user_id: ctx.user.id,
  });
  if (error) go(projectId, "error", "Não foi possível alterar este recurso do Laboratório VIP.");
  revalidatePath(`/vip/dashboard/projects/${projectId}`);
  revalidatePath("/vip/dashboard/beta");
  go(projectId, "message", enabled ? "Recurso VIP ativado." : "Recurso VIP desativado.");
}
