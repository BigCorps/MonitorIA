"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export async function saveDiscoveredCameraNamesAction(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = createAdminClient();
  const { data: cameras, error } = await supabase
    .from("cameras")
    .select("id")
    .eq("organization_id", organization.id)
    .is("setup_named_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    redirect("/dashboard/cameras/setup?error=" + encodeURIComponent("Não foi possível carregar as câmeras."));
  }

  const list = cameras ?? [];
  if (!list.length) redirect("/dashboard");

  const names = list.map((camera) => ({
    id: String(camera.id),
    name: String(formData.get(`camera_${camera.id}`) ?? "").trim(),
  }));

  if (names.some((camera) => camera.name.length < 2 || camera.name.length > 160)) {
    redirect("/dashboard/cameras/setup?error=" + encodeURIComponent("Dê um nome de 2 a 160 caracteres para cada câmera."));
  }

  const normalized = names.map((camera) => camera.name.toLocaleLowerCase("pt-BR"));
  if (new Set(normalized).size !== normalized.length) {
    redirect("/dashboard/cameras/setup?error=" + encodeURIComponent("Use nomes diferentes para identificar cada câmera."));
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
      redirect("/dashboard/cameras/setup?error=" + encodeURIComponent("Não foi possível salvar todos os nomes. Tente novamente."));
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard/trial");
  revalidatePath("/dashboard/plans");

  redirect(
    "/dashboard?message=" +
      encodeURIComponent("Câmeras identificadas. Agora explique o que a primeira câmera está vendo."),
  );
}
