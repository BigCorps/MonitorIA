"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
  slugify,
} from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  cleanText,
  normalizeCameraCount,
  normalizeIndustry,
} from "@/src/lib/onboarding-intake";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import {
  hashSalesTrialToken,
  normalizeSalesTrialToken,
} from "@/src/trial/sales-token";

function safeToken(value: FormDataEntryValue | null) {
  const token = normalizeSalesTrialToken(value);
  if (!token) redirect("/login");
  return token;
}

function leadRedirect(
  token: string,
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/lead/${token}?${kind}=${encodeURIComponent(message)}`,
  );
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

async function requireActiveInvite(token: string) {
  const invite = await getSalesTrialInvite(token);
  if (!invite || !invite.usable) {
    leadRedirect(
      token,
      "error",
      "Este convite comercial não está mais disponível.",
    );
  }
  return invite;
}

async function redeemInviteForWorkspace(
  token: string,
  organizationId: string,
  userId: string,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("redeem_sales_trial_invite", {
    p_token_hash: hashSalesTrialToken(token),
    p_organization_id: organizationId,
    p_user_id: userId,
  });

  if (error) {
    console.error("Falha ao aplicar convite comercial ao workspace:", error.message);
    return false;
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  return result.success === true;
}

export async function loginLeadAccountAction(formData: FormData) {
  const token = safeToken(formData.get("token"));
  await requireActiveInvite(token);

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || password.length < 8) {
    leadRedirect(
      token,
      "error",
      "Informe seu e-mail e uma senha com pelo menos 8 caracteres.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    leadRedirect(token, "error", "E-mail ou senha incorretos.");
  }

  redirect(`/lead/${token}`);
}

export async function createLeadAccountAction(formData: FormData) {
  const token = safeToken(formData.get("token"));
  await requireActiveInvite(token);

  const fullName = cleanText(formData.get("full_name"), 120);
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (fullName.length < 2 || !email || password.length < 8) {
    leadRedirect(
      token,
      "error",
      "Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.",
    );
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        password_login_enabled: true,
        sales_trial_invite: true,
        onboarding_source: "sales_lead_v1",
      },
      emailRedirectTo:
        `${origin}/auth/callback?next=` +
        encodeURIComponent(`/lead/${token}`),
    },
  });

  if (error) {
    const normalized = error.message.toLowerCase();
    if (normalized.includes("registered")) {
      leadRedirect(
        token,
        "error",
        "Este e-mail já está cadastrado. Entre com sua conta existente.",
      );
    }
    if (/weak|pwned|compromised|leaked/i.test(normalized)) {
      leadRedirect(
        token,
        "error",
        "Escolha uma senha mais forte e tente novamente.",
      );
    }
    leadRedirect(token, "error", "Não foi possível criar sua conta.");
  }

  if (data.session) {
    redirect(`/lead/${token}`);
  }

  leadRedirect(
    token,
    "message",
    "Conta criada. Confirme o e-mail e volte por este mesmo convite.",
  );
}

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "America/Sao_Paulo";
  }
}

export async function createLeadWorkspaceAction(formData: FormData) {
  const token = safeToken(formData.get("token"));
  await requireActiveInvite(token);
  const user = await requireAuthenticatedUser();

  const existing = await getCurrentOrganization(user.id);
  if (existing) redirect(`/lead/${token}`);

  const organizationName = cleanText(formData.get("organization_name"), 160);
  const siteName = cleanText(formData.get("site_name"), 160);
  const industry = normalizeIndustry(formData.get("industry"));
  const cameraCount = normalizeCameraCount(formData.get("camera_count"));
  const timezone = safeTimezone(
    String(formData.get("timezone") ?? "America/Sao_Paulo"),
  );

  if (organizationName.length < 2 || !siteName) {
    leadRedirect(token, "error", "Informe a empresa e o primeiro local.");
  }

  const supabase = await createClient();
  const baseSlug = slugify(organizationName) || "empresa";
  let organization: { id: string } | null = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const suffix =
      attempt === 0 ? "" : `-${Math.random().toString(36).slice(2, 6)}`;
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
    if (error?.code !== "23505") break;
  }

  if (!organization) {
    leadRedirect(token, "error", "Não foi possível criar a empresa.");
  }

  const { error: siteError } = await supabase.from("sites").insert({
    organization_id: organization.id,
    name: siteName,
    timezone,
  });

  if (siteError) {
    leadRedirect(
      token,
      "error",
      "A empresa foi criada, mas o local não pôde ser salvo.",
    );
  }

  const { error: profileError } = await supabase
    .from("organization_profiles")
    .upsert(
      {
        organization_id: organization.id,
        industry,
        contact_email: user.email ?? "",
        updated_by: user.id,
      },
      { onConflict: "organization_id" },
    );

  if (profileError) {
    console.error(
      "Falha ao salvar perfil comercial do onboarding lead:",
      profileError.message,
    );
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: {
      onboarding_source: "sales_lead_v1",
      onboarding_organization_name: organizationName,
      onboarding_site_name: siteName,
      onboarding_industry: industry,
      onboarding_camera_count: cameraCount,
      onboarding_workspace_created: true,
      sales_trial_invite: true,
    },
  });

  if (metadataError) {
    console.error(
      "Falha ao atualizar metadata do onboarding lead:",
      metadataError.message,
    );
  }

  // O convite é aplicado no mesmo request que cria a empresa. Assim o usuário
  // nunca chega ao passo 4 como self-service, mesmo se depois navegar direto
  // pelo dashboard e não voltar à página /lead.
  const redeemed = await redeemInviteForWorkspace(
    token,
    organization.id,
    user.id,
  );

  if (!redeemed) {
    leadRedirect(
      token,
      "error",
      "A empresa foi criada, mas o convite ainda precisa ser ativado. Clique novamente para continuar.",
    );
  }

  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        "Convite de demonstração aplicado. Siga a configuração guiada; o relógio ainda não começou.",
      ),
  );
}

export async function redeemSalesTrialInviteAction(formData: FormData) {
  const token = safeToken(formData.get("token"));
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    leadRedirect(token, "error", "Cadastre sua empresa antes de ativar o teste.");
  }

  const invite = await getSalesTrialInvite(token);
  if (
    invite?.status === "redeemed" &&
    invite.redeemedBy === user.id &&
    invite.redeemedOrganizationId === organization.id
  ) {
    redirect("/dashboard");
  }

  if (!invite?.usable) {
    leadRedirect(
      token,
      "error",
      "Este convite comercial não está mais disponível.",
    );
  }

  const redeemed = await redeemInviteForWorkspace(
    token,
    organization.id,
    user.id,
  );

  if (!redeemed) {
    leadRedirect(
      token,
      "error",
      "Não foi possível ativar o teste comercial. Fale com a equipe MonitorIA.",
    );
  }

  redirect(
    "/dashboard?message=" +
      encodeURIComponent(
        "Convite ativado. Agora siga a configuração guiada; o relógio ainda não começou.",
      ),
  );
}
