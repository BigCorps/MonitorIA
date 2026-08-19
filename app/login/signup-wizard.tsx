"use client";

import {
  Fragment,
  useActionState,
  useState,
} from "react";
import {
  BUSINESS_OPTIONS,
  DEFAULT_CAMERA_COUNT,
} from "@/src/lib/onboarding-intake";
import {
  createGoogleAccount,
  createMagicLinkAccount,
  createPasswordAccount,
  type SignupState,
} from "./actions";
import styles from "./signup-wizard.module.css";

type Draft = {
  industry: string;
  cameraCount: string;
  organizationName: string;
  siteName: string;
  fullName: string;
  email: string;
};

type AccessMode =
  | "password"
  | "link";

const initialState: SignupState = {
  status: "idle",
};

function IntakeFields({
  draft,
}: {
  draft: Draft;
}) {
  return (
    <>
      <input
        type="hidden"
        name="industry"
        value={draft.industry}
      />
      <input
        type="hidden"
        name="camera_count"
        value={draft.cameraCount}
      />
      <input
        type="hidden"
        name="organization_name"
        value={draft.organizationName}
      />
      <input
        type="hidden"
        name="site_name"
        value={draft.siteName}
      />
    </>
  );
}

function GoogleIcon() {
  return (
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
  );
}

function ActionMessage({
  state,
}: {
  state: SignupState;
}) {
  if (
    state.status === "idle"
  ) {
    return null;
  }

  return (
    <div
      className={
        state.status ===
        "email-sent"
          ? styles.success
          : styles.error
      }
      role={
        state.status === "error"
          ? "alert"
          : "status"
      }
    >
      {state.message}
    </div>
  );
}

export function SignupWizard() {
  const [step, setStep] =
    useState(1);
  const [accessMode, setAccessMode] =
    useState<AccessMode>("password");
  const [draft, setDraft] =
    useState<Draft>({
      industry: "",
      cameraCount: String(
        DEFAULT_CAMERA_COUNT,
      ),
      organizationName: "",
      siteName: "",
      fullName: "",
      email: "",
    });

  const [
    passwordState,
    passwordAction,
    passwordPending,
  ] = useActionState(
    createPasswordAccount,
    initialState,
  );
  const [
    linkState,
    linkAction,
    linkPending,
  ] = useActionState(
    createMagicLinkAccount,
    initialState,
  );

  const cameraCount = Number(
    draft.cameraCount,
  );
  const firstReady =
    Boolean(draft.industry) &&
    Number.isFinite(cameraCount) &&
    cameraCount >= 1 &&
    cameraCount <= 64;
  const secondReady =
    draft.organizationName
      .trim().length >= 2 &&
    draft.siteName.trim().length >=
      1;
  const busy =
    passwordPending || linkPending;

  function update<
    K extends keyof Draft,
  >(
    key: K,
    value: Draft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <div className={styles.wizard}>
      <div
        className={styles.progress}
        aria-label={`Etapa ${step} de 3`}
      >
        {[1, 2, 3].map(
          (number, index) => (
            <Fragment key={number}>
              <span
                data-active={
                  number <= step
                }
              >
                {number}
              </span>
              {index < 2 ? (
                <i />
              ) : null}
            </Fragment>
          ),
        )}
      </div>

      {step === 1 ? (
        <section
          className={styles.step}
        >
          <div
            className={
              styles.stepIntro
            }
          >
            <strong>
              Conte um pouco do seu
              negócio
            </strong>
            <span>
              São duas respostas simples
              para prepararmos o teste do
              jeito certo.
            </span>
          </div>

          <div>
            <span
              className={styles.label}
            >
              Qual é o seu tipo de
              negócio?
            </span>
            <div
              className={
                styles.businessGrid
              }
            >
              {BUSINESS_OPTIONS.map(
                (option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      styles.businessOption
                    }
                    data-selected={
                      draft.industry ===
                      option.value
                    }
                    onClick={() =>
                      update(
                        "industry",
                        option.value,
                      )
                    }
                  >
                    {option.label}
                  </button>
                ),
              )}
            </div>
          </div>

          <div
            className={styles.cameraRow}
          >
            <div
              className={
                styles.stepIntro
              }
            >
              <strong>
                Quantas câmeras você tem
                hoje?
              </strong>
              <span>
                Não precisa saber marca,
                modelo, IP ou qualquer
                configuração.
              </span>
            </div>
            <input
              className={
                styles.numberInput
              }
              type="number"
              inputMode="numeric"
              min={1}
              max={64}
              value={draft.cameraCount}
              onChange={(event) =>
                update(
                  "cameraCount",
                  event.target.value,
                )
              }
              aria-label="Quantidade de câmeras"
              required
            />
          </div>

          <p
            className={
              styles.cameraHelper
            }
          >
            Depois, o computador da loja
            procura as câmeras
            automaticamente.
          </p>

          <div
            className={styles.actions}
            data-first="true"
          >
            <button
              type="button"
              className={styles.next}
              disabled={!firstReady}
              onClick={() => setStep(2)}
            >
              Continuar
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section
          className={styles.step}
        >
          <div
            className={
              styles.stepIntro
            }
          >
            <strong>
              Onde vamos começar?
            </strong>
            <span>
              Esses nomes já vão aparecer
              no seu painel depois do
              cadastro.
            </span>
          </div>

          <label
            className={styles.label}
          >
            Nome da empresa
            <input
              className={styles.input}
              type="text"
              value={
                draft.organizationName
              }
              onChange={(event) =>
                update(
                  "organizationName",
                  event.target.value,
                )
              }
              placeholder="Ex.: Mercado São Jorge"
              minLength={2}
              maxLength={160}
              autoComplete="organization"
              required
            />
          </label>

          <label
            className={styles.label}
          >
            Nome do primeiro local
            <input
              className={styles.input}
              type="text"
              value={draft.siteName}
              onChange={(event) =>
                update(
                  "siteName",
                  event.target.value,
                )
              }
              placeholder="Ex.: Loja do centro"
              maxLength={160}
              required
            />
          </label>

          <div
            className={styles.note}
          >
            Você poderá adicionar outros
            locais depois. O nome das
            câmeras só será pedido quando
            o MonitorIA encontrar os
            aparelhos reais na sua rede.
          </div>

          <div
            className={styles.actions}
          >
            <button
              type="button"
              className={styles.back}
              onClick={() => setStep(1)}
            >
              Voltar
            </button>
            <button
              type="button"
              className={styles.next}
              disabled={!secondReady}
              onClick={() => setStep(3)}
            >
              Continuar
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section
          className={styles.step}
        >
          <div
            className={
              styles.stepIntro
            }
          >
            <strong>
              Como você quer acessar?
            </strong>
            <span>
              Escolha uma opção. Depois
              da autenticação, você
              continua direto no
              primeiro acesso do
              dashboard.
            </span>
          </div>

          <form
            action={
              createGoogleAccount
            }
          >
            <IntakeFields
              draft={draft}
            />
            <button
              type="submit"
              className={
                styles.googleButton
              }
              disabled={busy}
            >
              <GoogleIcon />
              <span>
                Continuar com Google
              </span>
            </button>
          </form>

          <div
            className={styles.orDivider}
          >
            <span>ou</span>
          </div>

          <div
            className={
              styles.methodTabs
            }
          >
            <button
              type="button"
              className={
                styles.methodTab
              }
              data-selected={
                accessMode ===
                "password"
              }
              onClick={() =>
                setAccessMode(
                  "password",
                )
              }
            >
              E-mail e senha
            </button>
            <button
              type="button"
              className={
                styles.methodTab
              }
              data-selected={
                accessMode === "link"
              }
              onClick={() =>
                setAccessMode("link")
              }
            >
              Link no e-mail
            </button>
          </div>

          {accessMode ===
          "password" ? (
            <form
              action={passwordAction}
              className={
                styles.accessForm
              }
            >
              <IntakeFields
                draft={draft}
              />
              <input
                type="hidden"
                name="next"
                value="/dashboard"
              />

              <ActionMessage
                state={passwordState}
              />

              <label
                className={
                  styles.label
                }
              >
                Seu nome
                <input
                  className={
                    styles.input
                  }
                  name="full_name"
                  type="text"
                  value={draft.fullName}
                  onChange={(event) =>
                    update(
                      "fullName",
                      event.target.value,
                    )
                  }
                  autoComplete="name"
                  placeholder="Como podemos chamar você?"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>

              <label
                className={
                  styles.label
                }
              >
                E-mail
                <input
                  className={
                    styles.input
                  }
                  name="email"
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    update(
                      "email",
                      event.target.value,
                    )
                  }
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  required
                />
              </label>

              <label
                className={
                  styles.label
                }
              >
                Crie sua senha
                <input
                  className={
                    styles.input
                  }
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Mínimo de 8 caracteres"
                  minLength={8}
                  required
                />
              </label>

              <button
                type="submit"
                className={
                  styles.submit
                }
                disabled={
                  passwordPending
                }
              >
                {passwordPending
                  ? "Criando seu acesso..."
                  : "Criar acesso e continuar"}
              </button>

              <p
                className={
                  styles.authHint
                }
              >
                Se a confirmação de
                e-mail estiver ativa, você
                confirma uma única vez e
                entra direto no painel,
                sem digitar a senha de
                novo.
              </p>
            </form>
          ) : (
            <form
              action={linkAction}
              className={
                styles.accessForm
              }
            >
              <IntakeFields
                draft={draft}
              />

              <ActionMessage
                state={linkState}
              />

              <label
                className={
                  styles.label
                }
              >
                Seu nome
                <input
                  className={
                    styles.input
                  }
                  name="full_name"
                  type="text"
                  value={draft.fullName}
                  onChange={(event) =>
                    update(
                      "fullName",
                      event.target.value,
                    )
                  }
                  autoComplete="name"
                  placeholder="Como podemos chamar você?"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </label>

              <label
                className={
                  styles.label
                }
              >
                E-mail
                <input
                  className={
                    styles.input
                  }
                  name="email"
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    update(
                      "email",
                      event.target.value,
                    )
                  }
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  required
                />
              </label>

              <button
                type="submit"
                className={
                  styles.submit
                }
                disabled={linkPending}
              >
                {linkPending
                  ? "Enviando link..."
                  : "Enviar link e continuar"}
              </button>
            </form>
          )}

          <div
            className={styles.note}
          >
            O teste só começa quando a
            primeira câmera estiver
            conectada. Criar a conta não
            inicia cobrança nem consome
            as 24 horas grátis.
          </div>

          <div
            className={styles.actions}
          >
            <button
              type="button"
              className={styles.back}
              onClick={() =>
                setStep(2)
              }
              disabled={busy}
            >
              Voltar
            </button>
            <div
              className={
                styles.savedIndicator
              }
            >
              ✓ Dados das etapas
              anteriores preservados
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
