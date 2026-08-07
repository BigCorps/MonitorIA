"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import {
  authCallbackUrl,
  ensureCanonicalAuthOrigin,
  logPasskeyDiagnostics,
  supportsWebAuthn,
} from "@/src/lib/auth-origin";
import styles from "./login-auth.module.css";

type Props = {
  next: string;
};

function authMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "");

  const normalized = message.toLowerCase();

  if (
    normalized.includes("auth_method_disabled") ||
    normalized.includes("method disabled")
  ) {
    return "Esta forma de entrar não está liberada para a sua conta. Tente outra opção da lista.";
  }

  if (
    normalized.includes("notallowederror") ||
    normalized.includes("cancel") ||
    normalized.includes("timed out")
  ) {
    return "O acesso foi cancelado ou demorou demais. Tente de novo.";
  }

  if (
    normalized.includes("passkey_disabled") ||
    normalized.includes("webauthn")
  ) {
    return "Não foi possível usar a biometria neste aparelho. Entre com senha, Google ou link no e-mail.";
  }

  return "Não foi possível concluir a entrada. Tente de novo.";
}

export function AuthButtons({ next }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState<
    "google" | "passkey" | null
  >(null);
  const [error, setError] = useState<string | null>(
    null,
  );

  async function signInWithGoogle() {
    // Se a página não estiver na origem canônica, canonicaliza e para aqui.
    // O PKCE guarda o code_verifier na origem atual; começar em www e voltar
    // em monitoria.cam perde o verifier e derruba o usuário na landing.
    if (!ensureCanonicalAuthOrigin()) return;

    setLoading("google");
    setError(null);

    try {
      // Sempre https://monitoria.cam/auth/callback, nunca window.location.
      // O redirectTo precisa bater exatamente com a lista de Redirect URLs
      // do Supabase; quando não bate, ele cai na Site URL (a landing).
      const redirectTo = authCallbackUrl(next);

      const { error: authError } =
        await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo,
          },
        });

      if (authError) throw authError;
    } catch (authError) {
      setError(authMessage(authError));
      setLoading(null);
    }
  }

  async function signInWithPasskey() {
    // A cerimônia WebAuthn valida o RP ID contra a origem da página. Ela só
    // pode começar depois que a navegação canônica terminou.
    if (!ensureCanonicalAuthOrigin()) return;

    if (!supportsWebAuthn()) {
      setError(
        "Este aparelho ou navegador não tem suporte a biometria. Entre com senha, Google ou link no e-mail.",
      );
      return;
    }

    setLoading("passkey");
    setError(null);

    try {
      const { error: authError } =
        await supabase.auth.signInWithPasskey();

      if (authError) throw authError;

      router.replace(next);
      router.refresh();
    } catch (authError) {
      logPasskeyDiagnostics("signin", authError);
      setError(authMessage(authError));
      setLoading(null);
    }
  }

  return (
    <div className={styles.wrapper}>
      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        className={`${styles.button} ${styles.passkey}`}
        onClick={signInWithPasskey}
        disabled={loading !== null}
      >
        <span
          className={styles.fingerprint}
          aria-hidden="true"
        >
          ◎
        </span>
        <span>
          {loading === "passkey"
            ? "Validando biometria..."
            : "Entrar com biometria"}
        </span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${styles.google}`}
        onClick={signInWithGoogle}
        disabled={loading !== null}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={styles.googleIcon}
        >
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09A6.9 6.9 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11.98 11.98 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        <span>
          {loading === "google"
            ? "Abrindo Google..."
            : "Continuar com Google"}
        </span>
      </button>

      <p className={styles.hint}>
        A biometria usa passkeys protegidas pelo aparelho.
        Nenhuma impressão digital ou imagem facial é
        enviada ao MonitorIA.
      </p>
    </div>
  );
}
