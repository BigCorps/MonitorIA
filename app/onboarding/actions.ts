"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  requireAuthenticatedUser,
  slugify,
} from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";
import {
  getCurrentOrganization,
} from "@/src/lib/dashboard-data";
import {
  cleanText,
  normalizeCameraCount,
  normalizeIndustry,
} from "@/src/lib/onboarding-intake";

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: value,
    }).format(new Date());
    return value;
  } catch {
    return "America/Sao_Paulo";
  }
}

function onboardingError(
  message: string,
): never {
  redirect(
    `/onboarding?error=${encodeURIComponent(
      message,
    )}`,
  );
}

export async function createWorkspace(
  formData: FormData,
) {
  const user =
    await requireAuthenticatedUser();
  const organizationName = cleanText(
    formData.get("organization_name"),
    160,
  );
  const siteName = cleanText(
    formData.get("site_name"),
    160,
  );
  const industry = normalizeIndustry(
    formData.get("industry") ??
      user.user_metadata
        ?.onboarding_industry,
  );
  const cameraCount =
    normalizeCameraCount(
      formData.get("camera_count_hint") ??
        user.user_metadata
          ?.onboarding_camera_count,
    );
  const timezone = safeTimezone(
    String(
      formData.get("timezone") ??
        "America/Sao_Paulo",
    ),
  );

  if (
    organizationName.length < 2 ||
    siteName.length < 1
  ) {
    onboardingError(
      "Informe a empresa e o primeiro local.",
    );
  }

  const existing =
    await getCurrentOrganization(user.id);
  if (existing) {
    redirect("/onboarding");
  }

  const supabase = await createClient();
  const baseSlug =
    slugify(organizationName) || "empresa";
  let organization: {
    id: string;
  } | null = null;
  let lastError = "";

  for (
    let attempt = 0;
    attempt < 4;
    attempt += 1
  ) {
    const suffix =
      attempt === 0
        ? ""
        : `-${Math.random()
            .toString(36)
            .slice(2, 6)}`;

    const { data, error } =
      await supabase
        .from("organizations")
        .insert({
          name: organizationName,
          slug: `${baseSlug}${suffix}`,
          created_by: user.id,
        })
        .select("id")
        .single();

    if (!error && data) {
      organization = {
        id: String(data.id),
      };
      break;
    }

    lastError =
      error?.message ??
      "erro desconhecido";

    if (error?.code !== "23505") {
      break;
    }
  }

  if (!organization) {
    console.error(
      "Falha ao criar organização:",
      lastError,
    );
    onboardingError(
      "Não foi possível criar a empresa. Tente novamente.",
    );
  }

  const { error: siteError } =
    await supabase.from("sites").insert({
      organization_id: organization.id,
      name: siteName,
      timezone,
    });

  if (siteError) {
    onboardingError(
      "A empresa foi criada, mas o local não pôde ser salvo. Tente novamente.",
    );
  }

  const { error: profileError } =
    await supabase
      .from("organization_profiles")
      .upsert(
        {
          organization_id:
            organization.id,
          industry,
          contact_email:
            user.email ?? "",
          updated_by: user.id,
        },
        {
          onConflict:
            "organization_id",
        },
      );

  if (profileError) {
    console.error(
      "Falha ao salvar perfil comercial do onboarding:",
      profileError.message,
    );
  }

  const { error: metadataError } =
    await supabase.auth.updateUser({
      data: {
        onboarding_source:
          "guided_signup_v1",
        onboarding_organization_name:
          organizationName,
        onboarding_site_name:
          siteName,
        onboarding_industry: industry,
        onboarding_camera_count:
          cameraCount,
        onboarding_workspace_created:
          true,
      },
    });

  if (metadataError) {
    console.error(
      "Falha ao atualizar metadata do onboarding:",
      metadataError.message,
    );
  }

  revalidatePath("/dashboard");
  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        "Local salvo. Agora conecte o computador da loja.",
      ),
  );
}

export async function createFirstSite(
  formData: FormData,
) {
  const user =
    await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  const siteName = cleanText(
    formData.get("site_name"),
    160,
  );
  const cameraCount =
    normalizeCameraCount(
      formData.get("camera_count_hint") ??
        user.user_metadata
          ?.onboarding_camera_count,
    );
  const timezone = safeTimezone(
    String(
      formData.get("timezone") ??
        "America/Sao_Paulo",
    ),
  );

  if (!siteName) {
    onboardingError("Informe o local.");
  }

  const supabase = await createClient();
  const { error } =
    await supabase.from("sites").insert({
      organization_id: organization.id,
      name: siteName,
      timezone,
    });

  if (error) {
    onboardingError(
      "Não foi possível criar o local.",
    );
  }

  const { error: metadataError } =
    await supabase.auth.updateUser({
      data: {
        onboarding_site_name:
          siteName,
        onboarding_camera_count:
          cameraCount,
        onboarding_workspace_created:
          true,
      },
    });

  if (metadataError) {
    console.error(
      "Falha ao atualizar metadata do primeiro local:",
      metadataError.message,
    );
  }

  revalidatePath("/dashboard");
  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        "Local salvo. Agora conecte o computador da loja.",
      ),
  );
}
