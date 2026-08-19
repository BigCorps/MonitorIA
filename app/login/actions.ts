"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/src/lib/supabase/server";
import { normalizeNextPath } from "@/src/lib/auth";
import {
  cleanText,
  normalizeCameraCount,
  normalizeIndustry,
} from "@/src/lib/onboarding-intake";

export type SignupState = {
  status: "idle" | "error";
  message?: string;
};

async function appOrigin() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(
      /\/$/,
      "",
    );
  }

  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") ??
    headerStore.get("host") ??
    "localhost:3000";
  const protocol =
    headerStore.get("x-forwarded-proto") ??
    (host.includes("localhost")
      ? "http"
      : "https");

  return `${protocol}://${host}`;
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get("email") ?? "")
      .trim()
      .toLowerCase(),
    password: String(
      formData.get("password") ?? "",
    ),
    next: normalizeNextPath(
      formData.get("next"),
    ),
  };
}

function authError(
  message: string,
  next: string,
): never {
  redirect(
    `/login?error=${encodeURIComponent(
      message,
    )}&next=${encodeURIComponent(next)}`,
  );
}

function errorText(error: {
  message: string;
  code?: string;
}) {
  return `${error.code ?? ""} ${error.message}`.toLowerCase();
}

function isEmailDeliveryError(
  message: string,
) {
  return /authentication credentials invalid|error sending|confirmation email|magic link|smtp|unexpected failure/i.test(
    message,
  );
}

function isWeakPasswordError(error: {
  message: string;
  code?: string;
}) {
  return /weak_password|weak|easy to guess|pwned|compromised|leaked/i.test(
    errorText(error),
  );
}

function isMethodDisabledError(error: {
  message: string;
  code?: string;
}) {
  return /auth_method_disabled|oauth_provider_not_allowed|method disabled/i.test(
    errorText(error),
  );
}

function reportAuthError(
  context: string,
  error: {
    message: string;
    status?: number;
    code?: string;
  },
) {
  console.error(
    `[MonitorIA Auth] ${context}`,
    {
      message: error.message,
      status: error.status,
      code: error.code,
    },
  );
}

export async function loginWithPassword(
  formData: FormData,
) {
  const { email, password, next } =
    readCredentials(formData);

  if (!email || password.length < 8) {
    authError(
      "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.",
      next,
    );
  }

  const supabase = await createClient();
  const { error } =
    await supabase.auth.signInWithPassword({
      email,
      password,
    });

  if (error) {
    reportAuthError(
      "signInWithPassword",
      error,
    );

    if (isMethodDisabledError(error)) {
      authError(
        "Esta forma de entrar não está liberada para a sua conta. Tente outra opção da lista.",
        next,
      );
    }

    authError(
      "E-mail ou senha incorretos.",
      next,
    );
  }

  redirect(next);
}

export async function createAccount(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const { email, password } =
    readCredentials(formData);
  const fullName = cleanText(
    formData.get("full_name"),
    120,
  );
  const organizationName = cleanText(
    formData.get("organization_name"),
    160,
  );
  const siteName = cleanText(
    formData.get("site_name"),
    160,
  );
  const industry = normalizeIndustry(
    formData.get("industry"),
  );
  const cameraCount = normalizeCameraCount(
    formData.get("camera_count"),
  );

  if (
    !email ||
    password.length < 8 ||
    fullName.length < 2
  ) {
    return {
      status: "error",
      message:
        "Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.",
    };
  }

  if (
    organizationName.length < 2 ||
    siteName.length < 1
  ) {
    return {
      status: "error",
      message:
        "Volte uma etapa e informe a empresa e o primeiro local.",
    };
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { data, error } =
    await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          password_login_enabled: true,
          onboarding_source:
            "guided_signup_v1",
          onboarding_organization_name:
            organizationName,
          onboarding_site_name: siteName,
          onboarding_industry: industry,
          onboarding_camera_count:
            cameraCount,
        },
        emailRedirectTo:
          `${origin}/auth/callback?next=` +
          encodeURIComponent(
            "/onboarding",
          ),
      },
    });

  if (error) {
    reportAuthError("signUp", error);

    if (isWeakPasswordError(error)) {
      return {
        status: "error",
        message:
          "Essa senha é muito comum ou já apareceu em vazamentos. Escolha outra, mais difícil de adivinhar.",
      };
    }

    if (
      error.message
        .toLowerCase()
        .includes("registered")
    ) {
      return {
        status: "error",
        message:
          "Este e-mail já está cadastrado. Use “Voltar para o login”.",
      };
    }

    if (
      isEmailDeliveryError(error.message) ||
      error.status === 500
    ) {
      return {
        status: "error",
        message:
          "Não conseguimos enviar o e-mail de confirmação agora. Tente novamente em alguns minutos.",
      };
    }

    return {
      status: "error",
      message:
        "Não foi possível criar a conta. Tente novamente.",
    };
  }

  if (data.session) {
    redirect("/onboarding");
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Conta criada. Confirme o e-mail para continuar a configuração.",
    )}`,
  );
}

export async function sendMagicLink(
  formData: FormData,
) {
  const email = String(
    formData.get("email") ?? "",
  )
    .trim()
    .toLowerCase();
  const next = normalizeNextPath(
    formData.get("next"),
  );

  if (!email) {
    authError(
      "Informe seu e-mail.",
      next,
    );
  }

  const origin = await appOrigin();
  const supabase = await createClient();
  const { error } =
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          `${origin}/auth/callback?next=` +
          encodeURIComponent(next),
        shouldCreateUser: false,
      },
    });

  if (error) {
    reportAuthError(
      "signInWithOtp",
      error,
    );

    if (
      isEmailDeliveryError(error.message) ||
      error.status === 500
    ) {
      authError(
        "Não conseguimos enviar o link agora. Tente novamente em alguns minutos.",
        next,
      );
    }

    authError(
      "Não foi possível enviar o link. Se você ainda não tem conta, use “Criar uma nova conta”.",
      next,
    );
  }

  redirect(
    `/login?message=${encodeURIComponent(
      "Enviamos um link de acesso para o seu e-mail.",
    )}`,
  );
}
