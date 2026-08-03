"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./mfa.module.css";

type Props = {
  next: string;
  email: string;
};

type TotpFactor = {
  id: string;
  status: string;
  friendly_name?: string;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function qrSource(value: string) {
  if (
    value.startsWith("data:image/") ||
    value.startsWith("http")
  ) {
    return value;
  }

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    value,
  )}`;
}

function errorMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : String(error ?? "");

  if (
    /invalid|expired|code|challenge/i.test(message)
  ) {
    return "Código inválido ou expirado. Gere um novo código no autenticador e tente novamente.";
  }

  return "Não foi possível concluir a verificação em duas etapas.";
}

export function MfaChallenge({
  next,
  email,
}: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [factors, setFactors] = useState<
    TotpFactor[]
  >([]);
  const [selectedFactor, setSelectedFactor] =
    useState("");
  const [enrollment, setEnrollment] =
    useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const aalResult =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aalResult.error) throw aalResult.error;

      if (
        aalResult.data.currentLevel === "aal2"
      ) {
        router.replace(next);
        router.refresh();
        return;
      }

      const factorResult =
        await supabase.auth.mfa.listFactors();

      if (factorResult.error) {
        throw factorResult.error;
      }

      const totpFactors = (
        factorResult.data.totp ?? []
      ) as TotpFactor[];

      const verified = totpFactors.filter(
        (factor: TotpFactor) =>
          factor.status === "verified",
      );

      setFactors(verified);
      setSelectedFactor(verified[0]?.id ?? "");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }

  async function startEnrollment() {
    setWorking(true);
    setError(null);

    try {
      const { data, error: enrollError } =
        await supabase.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "MonitorIA Authenticator",
        });

      if (enrollError) throw enrollError;

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (enrollError) {
      setError(errorMessage(enrollError));
    } finally {
      setWorking(false);
    }
  }

  async function verifyExisting() {
    if (!selectedFactor || code.length < 6) {
      setError(
        "Informe o código de seis dígitos do autenticador.",
      );
      return;
    }

    setWorking(true);
    setError(null);

    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({
          factorId: selectedFactor,
          code: code.trim(),
        });

      if (verifyError) throw verifyError;

      router.replace(next);
      router.refresh();
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setWorking(false);
    }
  }

  async function verifyEnrollment() {
    if (!enrollment || code.length < 6) {
      setError(
        "Informe o código de seis dígitos exibido no aplicativo autenticador.",
      );
      return;
    }

    setWorking(true);
    setError(null);

    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({
          factorId: enrollment.factorId,
          code: code.trim(),
        });

      if (verifyError) throw verifyError;

      router.replace(next);
      router.refresh();
    } catch (verifyError) {
      setError(errorMessage(verifyError));
    } finally {
      setWorking(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <a href="/" className={styles.brand}>
          <img
            src="/favicon.svg"
            alt=""
            width={30}
            height={30}
          />
          <span>
            Monitor<span>IA</span>.cam
          </span>
        </a>

        <div className={styles.heading}>
          <span>PROTEÇÃO DA CONTA</span>
          <h1>Verificação em duas etapas</h1>
          <p>
            Confirme o código do seu autenticador para
            continuar como <strong>{email}</strong>.
          </p>
        </div>

        {error ? (
          <div className={styles.error} role="alert">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loading}>
            Carregando proteção da conta...
          </div>
        ) : enrollment ? (
          <div className={styles.flow}>
            <div className={styles.setup}>
              <img
                src={qrSource(enrollment.qrCode)}
                alt="QR Code para configurar o autenticador"
                className={styles.qr}
              />
              <div>
                <strong>
                  Escaneie o QR Code
                </strong>
                <p>
                  Use Google Authenticator, Microsoft
                  Authenticator, Authy, 1Password ou
                  outro aplicativo TOTP.
                </p>
                <label>
                  Chave manual
                  <code>{enrollment.secret}</code>
                </label>
              </div>
            </div>

            <label className={styles.field}>
              <span>Código de seis dígitos</span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
              />
            </label>

            <button
              type="button"
              className={styles.primary}
              onClick={verifyEnrollment}
              disabled={working}
            >
              {working
                ? "Verificando..."
                : "Ativar e continuar"}
            </button>
          </div>
        ) : factors.length ? (
          <div className={styles.flow}>
            {factors.length > 1 ? (
              <label className={styles.field}>
                <span>Autenticador</span>
                <select
                  value={selectedFactor}
                  onChange={(event) =>
                    setSelectedFactor(
                      event.target.value,
                    )
                  }
                >
                  {factors.map((factor, index) => (
                    <option
                      key={factor.id}
                      value={factor.id}
                    >
                      {factor.friendly_name ||
                        `Autenticador ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className={styles.field}>
              <span>Código de seis dígitos</span>
              <input
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                autoFocus
              />
            </label>

            <button
              type="button"
              className={styles.primary}
              onClick={verifyExisting}
              disabled={working}
            >
              {working
                ? "Verificando..."
                : "Confirmar acesso"}
            </button>
          </div>
        ) : (
          <div className={styles.flow}>
            <div className={styles.notice}>
              Sua conta exige autenticação em duas
              etapas, mas ainda não possui um
              autenticador configurado.
            </div>
            <button
              type="button"
              className={styles.primary}
              onClick={startEnrollment}
              disabled={working}
            >
              {working
                ? "Preparando..."
                : "Configurar autenticador"}
            </button>
          </div>
        )}

        <button
          type="button"
          className={styles.signOut}
          onClick={signOut}
        >
          Sair e usar outra conta
        </button>
      </section>
    </main>
  );
}
