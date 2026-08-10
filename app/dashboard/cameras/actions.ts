"use server";

import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  monitoringGoalsFrom,
  pendingCameraValues,
} from "@/src/lib/camera-registration";
import {
  generatePairingCode,
  hashPairingCode,
} from "@/src/lib/agent-security";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { CameraActionState } from "./camera-action-state";

async function issuePairingCode(cameraId: string, createdBy: string) {
  const code = generatePairingCode();
  const codeHash = hashPairingCode(code);
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc(
    "create_agent_pairing_code",
    {
      p_camera_id: cameraId,
      p_code_hash: codeHash,
      p_created_by: createdBy,
    },
  );

  const result = Array.isArray(data) ? data[0] : data;

  if (error || !result) {
    throw new Error(
      error?.message ??
        "Não foi possível gerar o código de pareamento.",
    );
  }

  return {
    code,
    expiresAt: String(result.expires_at),
  };
}

export async function createCameraAction(
  _previousState: CameraActionState,
  formData: FormData,
): Promise<CameraActionState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return {
      status: "error",
      message:
        "Sua conta não tem permissão para cadastrar câmeras.",
    };
  }

  const name = String(formData.get("name") ?? "").trim();
  const description = String(
    formData.get("description") ?? "",
  )
    .trim()
    .slice(0, 500);
  const siteId = String(formData.get("site_id") ?? "").trim();
  const monitoringGoals = monitoringGoalsFrom(
    formData.get("monitoring_goals"),
  );

  if (name.length < 2 || name.length > 160 || !siteId) {
    return {
      status: "error",
      message: "Informe o nome da câmera e selecione o local.",
    };
  }

  const supabase = await createClient();
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("id")
    .eq("id", siteId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (siteError || !site) {
    return {
      status: "error",
      message: "O local selecionado não pertence à sua empresa.",
    };
  }

  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .insert(pendingCameraValues({
      organizationId: organization.id,
      siteId,
      name,
      description,
      monitoringGoals,
    }))
    .select("id,name")
    .single();

  if (cameraError || !camera) {
    console.error(
      "Falha ao criar câmera:",
      cameraError?.message,
    );
    return {
      status: "error",
      message: "Não foi possível cadastrar a câmera.",
    };
  }

  try {
    const pairing = await issuePairingCode(
      String(camera.id),
      user.id,
    );

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/cameras");
    revalidatePath("/dashboard/plans");

    return {
      status: "success",
      message:
        "Câmera criada. Use o código abaixo para instalar o Agent e depois escolha o plano.",
      cameraId: String(camera.id),
      cameraName: String(camera.name),
      pairingCode: pairing.code,
      expiresAt: pairing.expiresAt,
    };
  } catch (error) {
    console.error("Falha ao gerar pareamento:", error);
    await supabase.from("cameras").delete().eq("id", camera.id);

    return {
      status: "error",
      message:
        "A câmera não foi concluída porque o código de pareamento não pôde ser gerado.",
    };
  }
}

export async function regeneratePairingCodeAction(
  _previousState: CameraActionState,
  formData: FormData,
): Promise<CameraActionState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  const cameraId = String(formData.get("camera_id") ?? "");

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role) ||
    !cameraId
  ) {
    return {
      status: "error",
      message: "Não foi possível autorizar esta operação.",
    };
  }

  const supabase = await createClient();
  const { data: camera, error } = await supabase
    .from("cameras")
    .select("id,name")
    .eq("id", cameraId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error || !camera) {
    return {
      status: "error",
      message: "Câmera não encontrada.",
    };
  }

  try {
    const pairing = await issuePairingCode(cameraId, user.id);

    revalidatePath(`/dashboard/cameras/${cameraId}`);
    revalidatePath("/dashboard/cameras");

    return {
      status: "success",
      message:
        "Novo código criado. Códigos anteriores foram revogados.",
      cameraId,
      cameraName: String(camera.name),
      pairingCode: pairing.code,
      expiresAt: pairing.expiresAt,
    };
  } catch (pairingError) {
    console.error("Falha ao renovar pareamento:", pairingError);
    return {
      status: "error",
      message: "Não foi possível gerar um novo código.",
    };
  }
}
