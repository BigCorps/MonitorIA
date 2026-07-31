"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";

function clean(
  formData: FormData,
  name: string,
  maximumLength: number,
) {
  return String(formData.get(name) ?? "")
    .trim()
    .slice(0, maximumLength);
}

function profileRedirect(
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/dashboard/profile?${kind}=${encodeURIComponent(message)}`,
  );
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: value,
    }).format(new Date());
    return value;
  } catch {
    return "America/Sao_Paulo";
  }
}

function normalizeWebsite(value: string) {
  if (!value) return "";

  const candidate = /^https?:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    return new URL(candidate).toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function updatePersonalProfile(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const fullName = clean(formData, "full_name", 120);
  const phone = clean(formData, "phone", 40);
  const jobTitle = clean(formData, "job_title", 100);

  if (fullName.length < 2) {
    profileRedirect(
      "error",
      "Informe seu nome completo.",
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const existingMetadata =
    data.user?.user_metadata &&
    typeof data.user.user_metadata === "object"
      ? data.user.user_metadata
      : {};

  const { error } = await supabase.auth.updateUser({
    data: {
      ...existingMetadata,
      full_name: fullName,
      phone,
      job_title: jobTitle,
    },
  });

  if (error) {
    console.error(
      "Falha ao atualizar perfil pessoal:",
      error.message,
    );
    profileRedirect(
      "error",
      "Não foi possível atualizar seus dados.",
    );
  }

  revalidatePath("/dashboard/profile");
  profileRedirect(
    "message",
    "Dados pessoais atualizados.",
  );
}

export async function updateOrganizationProfile(
  formData: FormData,
) {
  const user = await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  if (
    organization.role !== "owner" &&
    organization.role !== "admin"
  ) {
    profileRedirect(
      "error",
      "Somente proprietários e administradores podem alterar a empresa.",
    );
  }

  const organizationName = clean(
    formData,
    "organization_name",
    160,
  );
  const legalName = clean(
    formData,
    "legal_name",
    200,
  );
  const taxId = clean(formData, "tax_id", 32).replace(
    /\D/g,
    "",
  );
  const companyPhone = clean(
    formData,
    "company_phone",
    40,
  );
  const contactEmail = clean(
    formData,
    "contact_email",
    254,
  ).toLowerCase();
  const industry = clean(formData, "industry", 120);
  const websiteInput = clean(
    formData,
    "website",
    500,
  );
  const website = normalizeWebsite(websiteInput);

  const siteName = clean(formData, "site_name", 160);
  const timezone = validTimezone(
    clean(formData, "timezone", 100),
  );

  if (organizationName.length < 2) {
    profileRedirect(
      "error",
      "Informe o nome da empresa.",
    );
  }

  if (!validEmail(contactEmail)) {
    profileRedirect(
      "error",
      "Informe um e-mail comercial válido.",
    );
  }

  if (taxId && taxId.length !== 14) {
    profileRedirect(
      "error",
      "O CNPJ deve conter 14 números.",
    );
  }

  if (website === null) {
    profileRedirect(
      "error",
      "Informe um site válido.",
    );
  }

  const address = {
    postal_code: clean(formData, "postal_code", 12),
    street: clean(formData, "street", 180),
    number: clean(formData, "number", 30),
    complement: clean(formData, "complement", 100),
    neighborhood: clean(
      formData,
      "neighborhood",
      100,
    ),
    city: clean(formData, "city", 100),
    state: clean(formData, "state", 2).toUpperCase(),
  };

  const supabase = await createClient();

  const { error: organizationError } = await supabase
    .from("organizations")
    .update({ name: organizationName })
    .eq("id", organization.id);

  if (organizationError) {
    console.error(
      "Falha ao atualizar organização:",
      organizationError.message,
    );
    profileRedirect(
      "error",
      "Não foi possível atualizar o nome da empresa.",
    );
  }

  const sites = await getOrganizationSites(
    organization.id,
  );
  const firstSite = sites[0] ?? null;

  if (firstSite) {
    const { error: siteError } = await supabase
      .from("sites")
      .update({
        name: siteName || firstSite.name,
        timezone,
        address,
      })
      .eq("organization_id", organization.id)
      .eq("id", firstSite.id);

    if (siteError) {
      console.error(
        "Falha ao atualizar local:",
        siteError.message,
      );
      profileRedirect(
        "error",
        "O nome da empresa foi salvo, mas o local não pôde ser atualizado.",
      );
    }
  }

  const { error: profileError } = await supabase
    .from("organization_profiles")
    .upsert(
      {
        organization_id: organization.id,
        legal_name: legalName,
        tax_id: taxId,
        phone: companyPhone,
        contact_email: contactEmail,
        website: website ?? "",
        industry,
        updated_by: user.id,
      },
      { onConflict: "organization_id" },
    );

  if (profileError) {
    console.error(
      "Falha ao atualizar perfil comercial:",
      profileError.message,
    );

    if (
      profileError.code === "PGRST205" ||
      profileError.code === "42P01"
    ) {
      profileRedirect(
        "error",
        "A migration de perfil ainda não foi aplicada no Supabase.",
      );
    }

    profileRedirect(
      "error",
      "Os dados principais foram salvos, mas os dados comerciais não puderam ser atualizados.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  profileRedirect(
    "message",
    "Dados da empresa atualizados.",
  );
}

export async function updateProfilePassword(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const password = String(
    formData.get("password") ?? "",
  );
  const confirmation = String(
    formData.get("confirmation") ?? "",
  );

  if (
    password.length < 8 ||
    password !== confirmation
  ) {
    profileRedirect(
      "error",
      "As senhas devem ser iguais e ter pelo menos 8 caracteres.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error(
      "Falha ao atualizar senha:",
      error.message,
    );
    profileRedirect(
      "error",
      "Não foi possível atualizar a senha. Entre novamente e tente outra vez.",
    );
  }

  profileRedirect("message", "Senha atualizada.");
}

export async function sendProfileMagicLink() {
  const user = await requireAuthenticatedUser();

  if (!user.email) {
    profileRedirect(
      "error",
      "Sua conta não possui um e-mail válido.",
    );
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: {
      emailRedirectTo:
        `${origin}/auth/callback?next=` +
        encodeURIComponent("/dashboard/profile"),
      shouldCreateUser: false,
    },
  });

  if (error) {
    console.error(
      "Falha ao enviar link mágico:",
      error.message,
    );
    profileRedirect(
      "error",
      "Não foi possível enviar o link de acesso.",
    );
  }

  profileRedirect(
    "message",
    "Enviamos um novo link de acesso para seu e-mail.",
  );
}
