"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";
import { notifyPrivacyRequest } from "@/src/lib/privacy-notification";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { consumeRateLimit } from "@/src/lib/rate-limit";

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


function passwordErrorMessage(error: {
  message: string;
  code?: string;
}) {
  const value = `${error.code ?? ""} ${error.message}`.toLowerCase();

  if (
    /weak_password|weak|easy to guess|pwned|compromised|leaked/.test(
      value,
    )
  ) {
    return "A senha escolhida é muito comum ou já apareceu em vazamentos. Use uma combinação mais forte e exclusiva.";
  }

  if (/same password|different from the old/.test(value)) {
    return "A nova senha deve ser diferente da senha atual.";
  }

  if (/reauth|nonce|recent session/.test(value)) {
    return "Sua sessão precisa ser confirmada novamente. Entre por link mágico e tente outra vez.";
  }

  return "Não foi possível salvar a senha. Tente novamente.";
}

async function currentUserHasPassword(
  supabase: Awaited<ReturnType<typeof createClient>>,
) {
  const { data, error } = await supabase.rpc(
    "current_user_has_password",
  );

  if (error) {
    console.error(
      "Falha ao consultar estado da senha:",
      error.message,
    );
    profileRedirect(
      "error",
      "A configuração de segurança ainda não foi aplicada no Supabase.",
    );
  }

  return data === true;
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
  const user = await requireAuthenticatedUser();

  if (!user.email) {
    profileRedirect(
      "error",
      "Sua conta não possui um e-mail válido.",
    );
  }

  const currentPassword = String(
    formData.get("current_password") ?? "",
  );
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
      "A nova senha e a confirmação devem ser iguais e ter pelo menos 8 caracteres.",
    );
  }

  const supabase = await createClient();
  const hasPassword =
    await currentUserHasPassword(supabase);

  if (hasPassword) {
    if (!currentPassword) {
      profileRedirect(
        "error",
        "Informe a senha atual para fazer a alteração.",
      );
    }

    if (currentPassword === password) {
      profileRedirect(
        "error",
        "A nova senha deve ser diferente da senha atual.",
      );
    }

    const { error: currentPasswordError } =
      await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

    if (currentPasswordError) {
      console.error(
        "Falha ao confirmar senha atual:",
        currentPasswordError.message,
      );
      profileRedirect(
        "error",
        "A senha atual está incorreta.",
      );
    }
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    console.error(
      hasPassword
        ? "Falha ao alterar senha:"
        : "Falha ao criar senha:",
      error.message,
    );
    profileRedirect(
      "error",
      passwordErrorMessage(error),
    );
  }

  const { error: statusError } = await supabase.rpc(
    "mark_current_user_password_enabled",
  );

  if (statusError) {
    console.error(
      "A senha foi salva, mas o estado não pôde ser marcado:",
      statusError.message,
    );
  }

  revalidatePath("/dashboard/profile");

  profileRedirect(
    "message",
    hasPassword
      ? "Senha alterada com sucesso."
      : "Senha criada. Agora você pode entrar por senha ou link mágico.",
  );
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

const privacyRequestTypes = new Set([
  "confirmation",
  "access",
  "correction",
  "information",
  "restriction",
  "deletion",
  "portability",
  "opposition",
  "review",
]);

const privacyScopes = new Set(["account", "monitoring", "all"]);

export async function createPrivacyRequest(formData: FormData) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const requestType = clean(formData, "request_type", 40);
  const scope = clean(formData, "scope", 40);
  const details = clean(formData, "details", 2000);

  if (!privacyRequestTypes.has(requestType) || !privacyScopes.has(scope)) {
    profileRedirect("error", "Selecione uma solicitação de privacidade válida.");
  }

  if (details.length < 10) {
    profileRedirect(
      "error",
      "Descreva sua solicitação de privacidade com pelo menos 10 caracteres.",
    );
  }

  let limit;
  try {
    limit = await consumeRateLimit({
      scope: "privacy-request",
      subject: `${organization.id}:${user.id}`,
      limit: 5,
      windowSeconds: 3600,
    });
  } catch {
    profileRedirect(
      "error",
      "O canal de privacidade está temporariamente indisponível.",
    );
  }

  if (!limit.allowed) {
    profileRedirect(
      "error",
      "Limite temporário de solicitações atingido. Tente novamente mais tarde.",
    );
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("privacy_requests")
    .insert({
      organization_id: organization.id,
      requester_user_id: user.id,
      request_type: requestType,
      scope,
      details,
    })
    .select("id,response_due_at")
    .maybeSingle();

  if (error) {
    console.error("Falha ao registrar solicitação de privacidade:", error.code);
    profileRedirect(
      "error",
      "Não foi possível registrar a solicitação de privacidade.",
    );
  }

  /*
   * Aviso por e-mail. O prazo legal é de 15 dias e o pedido ficava só no
   * banco, visível apenas para quem lembrasse de olhar.
   *
   * O await é proposital: em ambiente sem servidor, disparar sem esperar faz
   * a função encerrar antes do envio sair. Falha de e-mail não derruba o
   * pedido — notifyPrivacyRequest trata os próprios erros.
   */
  await notifyPrivacyRequest({
    // A tabela não tem coluna de protocolo; o id é o identificador.
    protocol: String((inserted as any)?.id ?? "sem identificador"),
    dueAt: (inserted as any)?.response_due_at ?? null,
    requestType,
    scope,
    details,
    userEmail: user.email ?? null,
    organizationName: organization.name,
    organizationId: organization.id,
  });

  revalidatePath("/dashboard/profile");
  profileRedirect(
    "message",
    "Solicitação de privacidade registrada. Acompanhe o status nesta página.",
  );
}
