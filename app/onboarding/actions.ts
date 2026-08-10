"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser, slugify } from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  monitoringGoalsFrom,
  pendingCameraValues,
} from "@/src/lib/camera-registration";

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "America/Sao_Paulo";
  }
}

function onboardingError(message: string): never {
  redirect(`/onboarding?error=${encodeURIComponent(message)}`);
}

export async function createWorkspace(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const siteName = String(formData.get("site_name") ?? "").trim();
  const cameraName = String(formData.get("camera_name") ?? "").trim();
  const monitoringGoals = monitoringGoalsFrom(formData.get("monitoring_goals"));
  const timezone = safeTimezone(String(formData.get("timezone") ?? "America/Sao_Paulo"));

  if (organizationName.length < 2 || siteName.length < 1 || cameraName.length < 2) {
    onboardingError("Informe a empresa, o primeiro local e o nome da câmera.");
  }

  const existing = await getCurrentOrganization(user.id);
  if (existing) redirect("/onboarding");

  const supabase = await createClient();
  const baseSlug = slugify(organizationName) || "empresa";
  let organization: { id: string } | null = null;
  let lastError = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("organizations")
      .insert({
        name: organizationName,
        slug: `${baseSlug}${suffix}`,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!error && data) {
      organization = { id: String(data.id) };
      break;
    }

    lastError = error?.message ?? "erro desconhecido";
    if (error?.code !== "23505") break;
  }

  if (!organization) {
    console.error("Falha ao criar organização:", lastError);
    onboardingError("Não foi possível criar a empresa. Tente novamente.");
  }

  const organizationId = organization.id;

  const { data: site, error: siteError } = await supabase
    .from("sites")
    .insert({
      organization_id: organizationId,
      name: siteName,
      timezone,
    })
    .select("id")
    .single();

  if (siteError || !site) {
    onboardingError("A empresa foi criada, mas o local não pôde ser salvo. Tente novamente.");
  }

  const { error: cameraError } = await supabase.from("cameras").insert(
    pendingCameraValues({
      organizationId,
      siteId: String(site.id),
      name: cameraName,
      monitoringGoals,
    }),
  );

  if (cameraError) {
    console.error("Falha ao criar a câmera do onboarding:", cameraError.message);
    redirect(
      "/dashboard?message=" +
        encodeURIComponent(
          "O local foi salvo. Conclua o cadastro da câmera abaixo.",
        ),
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard?message=Dados%20salvos.%20Continue%20a%20instala%C3%A7%C3%A3o%20abaixo.");
}

export async function createFirstSite(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const siteName = String(formData.get("site_name") ?? "").trim();
  const cameraName = String(formData.get("camera_name") ?? "").trim();
  const monitoringGoals = monitoringGoalsFrom(formData.get("monitoring_goals"));
  const timezone = safeTimezone(String(formData.get("timezone") ?? "America/Sao_Paulo"));
  if (!siteName || cameraName.length < 2) {
    onboardingError("Informe o local e o nome da primeira câmera.");
  }

  const supabase = await createClient();
  const { data: site, error } = await supabase
    .from("sites")
    .insert({
      organization_id: organization.id,
      name: siteName,
      timezone,
    })
    .select("id")
    .single();

  if (error || !site) onboardingError("Não foi possível criar o local.");

  const { error: cameraError } = await supabase.from("cameras").insert(
    pendingCameraValues({
      organizationId: organization.id,
      siteId: String(site.id),
      name: cameraName,
      monitoringGoals,
    }),
  );

  if (cameraError) {
    console.error("Falha ao criar a câmera do onboarding:", cameraError.message);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?message=Dados%20salvos.%20Continue%20a%20instala%C3%A7%C3%A3o%20abaixo.");
}
