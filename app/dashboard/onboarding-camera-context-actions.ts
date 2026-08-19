"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

const CameraIdSchema = z.string().uuid();

export type OnboardingCameraNameState = {
  status: "idle" | "success" | "error";
  message?: string;
};

/**
 * Arquivos marcados com "use server" só podem exportar funções assíncronas
 * em runtime. O estado inicial fica no componente cliente; aqui permanece
 * apenas a Server Action.
 */
export async function saveOnboardingCameraNameAction(
  _previousState: OnboardingCameraNameState,
  formData: FormData,
): Promise<OnboardingCameraNameState> {
  const cameraId = String(formData.get("camera_id") ?? "");
  const name = String(formData.get("camera_name") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);

  if (!CameraIdSchema.safeParse(cameraId).success) {
    return {
      status: "error",
      message: "A câmera selecionada é inválida.",
    };
  }

  if (name.length < 2) {
    return {
      status: "error",
      message: "Informe um nome com pelo menos 2 caracteres.",
    };
  }

  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization || !["owner", "admin"].includes(organization.role)) {
    return {
      status: "error",
      message: "Sua conta não tem permissão para renomear esta câmera.",
    };
  }

  const admin = createAdminClient();

  const { data: duplicate } = await admin
    .from("cameras")
    .select("id")
    .eq("organization_id", organization.id)
    .neq("id", cameraId)
    .ilike("name", name)
    .limit(1)
    .maybeSingle();

  if (duplicate) {
    return {
      status: "error",
      message: "Já existe outra câmera com esse nome. Use um nome diferente.",
    };
  }

  const { error } = await admin
    .from("cameras")
    .update({
      name,
      setup_named_at: new Date().toISOString(),
    })
    .eq("id", cameraId)
    .eq("organization_id", organization.id);

  if (error) {
    console.error("Falha ao salvar nome no onboarding:", error.message);
    return {
      status: "error",
      message: "Não foi possível salvar o nome agora. Tente novamente.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cameras");
  revalidatePath(`/dashboard/cameras/${cameraId}`);

  return {
    status: "success",
    message: "Nome salvo. Agora configure o contexto desta câmera.",
  };
}
