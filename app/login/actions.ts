"use server";

import { redirect } from "next/navigation";
import {
  createClient,
} from "@/src/lib/supabase/server";
import {
  normalizeNextPath,
} from "@/src/lib/auth";
import {
  authCallbackUrl,
} from "@/src/lib/auth-origin";
import {
  cleanText,
  hasRequiredOnboardingIntake,
  onboardingIntakeFromFormData,
  type OnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  savePendingOnboarding,
} from "@/src/lib/pending-onboarding";

export type SignupState = {
  status:
    | "idle"
    | "error"
    | "email-sent";
  message?: string;
};

function readCredentials(
  formData: FormData,
) {
  return {
    email: String(
      formData.get("email") ?? "",
    )
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

function signupMetadata(
  fullName: string,
  intake: OnboardingIntake,
) {
  return {
    full_name: fullName,
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
  };
}

function authError(
  message: string,
  next: string,
): never {
  redirect(
    `/login?error=${encodeURIComponent(
      message,
    )}&next=${encodeURIComponent(
      next,
    )}`,
  );
}

function signupPageError(
  message: string,
): never {
  redirect(
    `/login?criar=1&error=${encodeURIComponent(
      message,
    )}`,
  );
}

function errorText(error: {
  message: string;
  code?: string;
}) {
  return `${
    error.code ?? ""
  } ${error.message}`.toLowerCase();
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

function isEmailNotConfirmed(error: {
  message: string;
  code?: string;
}) {
  return /email_not_confirmed|email not confirmed|email.*confirm/i.test(
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

function readSignupIntake(
  formData: FormData,
) {
  const intake =
    onboardingIntakeFromFormData(
      formData,
    );

  if (
    !hasRequiredOnboardingIntake(
      intake,
    )
  ) {
    return null;
  }

  return intake;
}

export async function loginWithPassword(
  formData: FormData,
) {
  const { email, password, next } =
    readCredentials(formData);

  if (
    !email ||
    password.length < 8
  ) {
    authError(
      "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.",
      next,
    );
  }

  const supabase =
    await createClient();
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

    if (
      isMethodDisabledError(error)
    ) {
      authError(
        "Esta forma de entrar não está liberada para a sua conta. Tente outra opção da lista.",
        next,
      );
    }

    if (
      isEmailNotConfirmed(error)
    ) {
      authError(
        "Seu e-mail ainda precisa ser confirmado. Abra a mensagem do MonitorIA e use o link de confirmação.",
        next,
      );
    }

    authError(
      "Não foi possível entrar com essa senha. Se sua conta foi criada com Google ou link de acesso, use a mesma opção.",
      next,
    );
  }

  redirect(next);
}

export async function createPasswordAccount(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const intake =
    readSignupIntake(formData);
  const { email, password } =
    readCredentials(formData);
  const fullName = cleanText(
    formData.get("full_name"),
    120,
  );

  if (!intake) {
    return {
      status: "error",
      message:
        "Volte às etapas anteriores e confirme os dados da empresa e do local.",
    };
  }

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

  await savePendingOnboarding(
    intake,
  );

  const supabase =
    await createClient();
  const { data, error } =
    await supabase.auth.signUp({
      email,
      password,
      options: {
        data: signupMetadata(
          fullName,
          intake,
        ),
        emailRedirectTo:
          authCallbackUrl(
            "/onboarding/complete",
          ),
      },
    });

  if (error) {
    reportAuthError(
      "guidedPasswordSignUp",
      error,
    );

    if (
      isWeakPasswordError(error)
    ) {
      return {
        status: "error",
        message:
          "Essa senha é muito comum ou já apareceu em vazamentos. Escolha outra, mais difícil de adivinhar.",
      };
    }

    if (
      isEmailDeliveryError(
        error.message,
      ) ||
      error.status === 500
    ) {
      return {
        status: "error",
        message:
          "Não conseguimos enviar a confirmação agora. Tente novamente em alguns minutos.",
      };
    }

    return {
      status: "error",
      message:
        "Não foi possível criar o acesso com senha. Se este e-mail já possui uma conta, use Google ou link no e-mail.",
    };
  }

  if (data.session) {
    redirect(
      "/onboarding/complete",
    );
  }

  if (
    data.user &&
    Array.isArray(
      data.user.identities,
    ) &&
    data.user.identities.length === 0
  ) {
    return {
      status: "error",
      message:
        "Este e-mail já possui um acesso. Use Google, link no e-mail ou volte para o login.",
    };
  }

  return {
    status: "email-sent",
    message:
      "Conta criada. Enviamos uma confirmação para o seu e-mail. Clique no link e você entrará automaticamente, continuando direto no painel — não será necessário digitar a senha novamente.",
  };
}

export async function createMagicLinkAccount(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const intake =
    readSignupIntake(formData);
  const email = String(
    formData.get("email") ?? "",
  )
    .trim()
    .toLowerCase();
  const fullName = cleanText(
    formData.get("full_name"),
    120,
  );

  if (!intake) {
    return {
      status: "error",
      message:
        "Volte às etapas anteriores e confirme os dados da empresa e do local.",
    };
  }

  if (
    !email ||
    fullName.length < 2
  ) {
    return {
      status: "error",
      message:
        "Informe seu nome e um e-mail válido.",
    };
  }

  await savePendingOnboarding(
    intake,
  );

  const supabase =
    await createClient();
  const { error } =
    await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: signupMetadata(
          fullName,
          intake,
        ),
        emailRedirectTo:
          authCallbackUrl(
            "/onboarding/complete",
          ),
      },
    });

  if (error) {
    reportAuthError(
      "guidedMagicLinkSignUp",
      error,
    );

    return {
      status: "error",
      message:
        isEmailDeliveryError(
          error.message,
        )
          ? "Não conseguimos enviar o link agora. Tente novamente em alguns minutos."
          : "Não foi possível enviar o link de acesso.",
    };
  }

  return {
    status: "email-sent",
    message:
      "Link enviado. Ao abrir o e-mail e tocar no link, você entrará automaticamente e continuará direto no painel.",
  };
}

export async function createGoogleAccount(
  formData: FormData,
) {
  const intake =
    readSignupIntake(formData);

  if (!intake) {
    signupPageError(
      "Volte às etapas anteriores e confirme os dados da empresa e do local.",
    );
  }

  await savePendingOnboarding(
    intake,
  );

  const supabase =
    await createClient();
  const { data, error } =
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo:
          authCallbackUrl(
            "/onboarding/complete",
          ),
      },
    });

  if (error || !data.url) {
    if (error) {
      reportAuthError(
        "guidedGoogleSignUp",
        error,
      );
    }

    signupPageError(
      "Não foi possível abrir o Google agora. Tente novamente.",
    );
  }

  redirect(data.url);
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

  const supabase =
    await createClient();
  const { error } =
    await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          authCallbackUrl(next),
        shouldCreateUser: false,
      },
    });

  if (error) {
    reportAuthError(
      "signInWithOtp",
      error,
    );

    if (
      isEmailDeliveryError(
        error.message,
      ) ||
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
