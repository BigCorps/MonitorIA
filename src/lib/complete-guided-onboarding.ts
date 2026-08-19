import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  type AuthenticatedUser,
  slugify,
} from "@/src/lib/auth";
import {
  type OnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  createClient,
} from "@/src/lib/supabase/server";

export async function completeGuidedOnboarding(
  user: AuthenticatedUser,
  intake: OnboardingIntake,
) {
  const supabase = await createClient();
  let organization =
    await getCurrentOrganization(user.id);
  let organizationId =
    organization?.id ?? null;

  if (!organizationId) {
    const baseSlug =
      slugify(intake.organizationName) ||
      "empresa";
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
            name: intake.organizationName,
            slug: `${baseSlug}${suffix}`,
            created_by: user.id,
          })
          .select("id")
          .single();

      if (!error && data) {
        organizationId =
          String(data.id);
        break;
      }

      lastError =
        error?.message ??
        "erro desconhecido";

      if (error?.code !== "23505") {
        break;
      }
    }

    if (!organizationId) {
      throw new Error(
        `Não foi possível criar a empresa: ${lastError}`,
      );
    }
  }

  const currentSites =
    await getOrganizationSites(
      organizationId,
    );

  if (!currentSites.length) {
    const { error: siteError } =
      await supabase
        .from("sites")
        .insert({
          organization_id:
            organizationId,
          name: intake.siteName,
          timezone:
            "America/Sao_Paulo",
        });

    if (siteError) {
      throw new Error(
        `Não foi possível criar o primeiro local: ${siteError.message}`,
      );
    }
  }

  const { error: profileError } =
    await supabase
      .from("organization_profiles")
      .upsert(
        {
          organization_id:
            organizationId,
          industry: intake.industry,
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
      "[MonitorIA Onboarding] perfil comercial:",
      profileError.message,
    );
  }

  const { error: metadataError } =
    await supabase.auth.updateUser({
      data: {
        onboarding_source:
          "guided_signup_v2",
        onboarding_organization_name:
          intake.organizationName,
        onboarding_site_name:
          intake.siteName,
        onboarding_industry:
          intake.industry,
        onboarding_camera_count:
          intake.cameraCount,
        onboarding_workspace_created:
          true,
      },
    });

  if (metadataError) {
    console.error(
      "[MonitorIA Onboarding] metadata:",
      metadataError.message,
    );
  }

  organization =
    await getCurrentOrganization(user.id);

  return {
    organizationId,
    organizationName:
      organization?.name ??
      intake.organizationName,
  };
}
