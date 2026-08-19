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
  createAccount,
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

const initialState: SignupState = {
  status: "idle",
};

export function SignupWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<Draft>({
    industry: "",
    cameraCount: String(
      DEFAULT_CAMERA_COUNT,
    ),
    organizationName: "",
    siteName: "",
    fullName: "",
    email: "",
  });
  const [state, formAction, pending] =
    useActionState(
      createAccount,
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
    draft.organizationName.trim().length >= 2 &&
    draft.siteName.trim().length >= 1;

  function update<K extends keyof Draft>(
    key: K,
    value: Draft[K],
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <form
      action={formAction}
      className={styles.wizard}
    >
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
      <input
        type="hidden"
        name="next"
        value="/onboarding"
      />

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
              {index < 2 ? <i /> : null}
            </Fragment>
          ),
        )}
      </div>

      {step === 1 ? (
        <section className={styles.step}>
          <div className={styles.stepIntro}>
            <strong>
              Conte um pouco do seu negócio
            </strong>
            <span>
              São duas respostas simples para
              prepararmos o teste do jeito certo.
            </span>
          </div>

          <div>
            <span className={styles.label}>
              Qual é o seu tipo de negócio?
            </span>
            <div
              className={styles.businessGrid}
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

          <div className={styles.cameraRow}>
            <div className={styles.stepIntro}>
              <strong>
                Quantas câmeras você tem hoje?
              </strong>
              <span>
                Não precisa saber marca, modelo,
                IP ou qualquer configuração.
              </span>
            </div>
            <input
              className={styles.numberInput}
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

          <p className={styles.cameraHelper}>
            Depois, o computador da loja procura
            as câmeras automaticamente.
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
        <section className={styles.step}>
          <div className={styles.stepIntro}>
            <strong>
              Onde vamos começar?
            </strong>
            <span>
              Esses nomes já vão aparecer no seu
              painel depois do cadastro.
            </span>
          </div>

          <label className={styles.label}>
            Nome da empresa
            <input
              className={styles.input}
              type="text"
              value={draft.organizationName}
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

          <label className={styles.label}>
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

          <div className={styles.note}>
            Você poderá adicionar outros locais
            depois. O nome das câmeras só será
            pedido quando o MonitorIA encontrar
            os aparelhos reais na sua rede.
          </div>

          <div className={styles.actions}>
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
        <section className={styles.step}>
          <div className={styles.stepIntro}>
            <strong>
              Agora crie seu acesso
            </strong>
            <span>
              Suas respostas já estão prontas para
              seguir com você ao painel.
            </span>
          </div>

          {state.status === "error" ? (
            <div
              className={styles.error}
              role="alert"
            >
              {state.message}
            </div>
          ) : null}

          <label className={styles.label}>
            Seu nome
            <input
              className={styles.input}
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

          <label className={styles.label}>
            E-mail
            <input
              className={styles.input}
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

          <label className={styles.label}>
            Senha
            <input
              className={styles.input}
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo de 8 caracteres"
              minLength={8}
              required
            />
          </label>

          <div className={styles.note}>
            O teste não começa no cadastro. Ele
            começa quando a primeira câmera estiver
            conectada ao MonitorIA.
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.back}
              onClick={() => setStep(2)}
              disabled={pending}
            >
              Voltar
            </button>
            <button
              type="submit"
              className={styles.submit}
              disabled={pending}
            >
              {pending
                ? "Criando sua conta..."
                : "Criar conta e continuar"}
            </button>
          </div>
        </section>
      ) : null}
    </form>
  );
}
