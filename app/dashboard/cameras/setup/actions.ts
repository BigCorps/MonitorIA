"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type CameraNamingState = {
  status: "idle" | "error";
  message?: string;
};

export async function saveDiscoveredCameraNamesAction(
  _previousState: CameraNamingState,
  formData: FormData,
): Promise<CameraNamingState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return {
      status: "error",
      message: "Não encontramos sua organização. Entre novamente.",
    };
  }

  const supabase = createAdminClient();
  const { data: cameras, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("organization_id", organization.id)
    .is("setup_named_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    return { status: "error", message: "Não foi possível carregar as câmeras." };
  }

  const list = cameras ?? [];
  if (!list.length) redirect("/dashboard");

  const names = list.map((camera) => ({
    id: String(camera.id),
    name: String(formData.get(`camera_${camera.id}`) ?? "").trim(),
  }));

  if (names.some((camera) => camera.name.length < 2 || camera.name.length > 160)) {
    return {
      status: "error",
      message: "Dê um nome de 2 a 160 caracteres para cada câmera.",
    };
  }

  const normalized = names.map((camera) =>
    camera.name.toLocaleLowerCase("pt-BR"),
  );

  if (new Set(normalized).size !== normalized.length) {
    return {
      status: "error",
      message: "Use nomes diferentes para identificar cada câmera.",
    };
  }

  const now = new Date().toISOString();
  for (const camera of names) {
    const { error: updateError } = await supabase
      .from("cameras")
      .update({ name: camera.name, setup_named_at: now })
      .eq("id", camera.id)
      .eq("organization_id", organization.id);

    if (updateError) {
      console.error("Falha ao nomear câmera:", updateError.message);
      return {
        status: "error",
        message: "Não foi possível salvar todos os nomes. Tente novamente.",
      };
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard/cameras/setup");
  revalidatePath("/dashboard/trial");
  revalidatePath("/dashboard/plans");

  const flow = String(formData.get("flow") ?? "");
  if (flow === "onboarding") redirect("/dashboard");

  redirect(`/dashboard/cameras/${names[0].id}?onboarding=1`);
}
