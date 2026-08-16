"use client";

import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import type {
  CameraSubscriptionSummary,
  CommercialPlan,
  CommercialPlanCode,
  VolumeDiscountTier,
} from "@/src/billing/types";
import {
  calculateVolumePricing,
  formatBrl,
  nextDiscountMessage,
} from "@/src/billing/pricing";
import type { CameraSummary } from "@/src/lib/dashboard-data";
import { createDraftInvoiceAction } from "./actions";
import styles from "./plans.module.css";

type Props = {
  cameras: CameraSummary[];
  plans: CommercialPlan[];
  tiers: VolumeDiscountTier[];
  subscriptions: CameraSubscriptionSummary[];
  canManage: boolean;
};

function SubmitButton({
  disabled,
}: {
  disabled: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.submitButton}
      type="submit"
      disabled={pending || disabled}
    >
      {pending
        ? "Preparando fatura..."
        : disabled
          ? "Escolha pelo menos uma câmera"
          : "Salvar configuração e preparar fatura"}
    </button>
  );
}

function Feature({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <li>
      <span aria-hidden="true">✓</span>
      {children}
    </li>
  );
}

function planFeatures(plan: CommercialPlan) {
  const features: ReactNode[] = [
    <Feature key="retention">
      Histórico pesquisável por{" "}
      {plan.metadataRetentionDays} dias
    </Feature>,
    <Feature key="keyframes">
      {plan.longTermKeyframes}{" "}
      {plan.longTermKeyframes === 1
        ? "imagem principal"
        : "imagens principais"}{" "}
      por acontecimento
    </Feature>,
    <Feature key="frames">
      Até {plan.maximumAnalysisFrames}{" "}
      {plan.maximumAnalysisFrames === 1
        ? "quadro na análise"
        : "quadros na análise"}
    </Feature>,
  ];

  if (plan.clipEnabled) {
    features.push(
      <Feature key="clip">
        Vídeo completo do acontecimento por{" "}
        {plan.clipRetentionDays} dias
      </Feature>,
      <Feature key="clip-download">
        Assistir e baixar o vídeo preservado
      </Feature>,
    );
  }

  return features;
}

function canExcludeSubscription(
  subscription: CameraSubscriptionSummary | undefined,
) {
  if (!subscription) return true;

  return [
    "pending_payment",
    "cancelled",
  ].includes(subscription.status);
}

export function PlanSelector({
  cameras,
  plans,
  tiers,
  subscriptions,
  canManage,
}: Props) {
  const subscriptionByCamera = useMemo(
    () =>
      new Map(
        subscriptions.map((subscription) => [
          subscription.cameraId,
          subscription,
        ]),
      ),
    [subscriptions],
  );

  const [selection, setSelection] = useState<
    Record<string, CommercialPlanCode | null>
  >(() =>
    Object.fromEntries(
      cameras.map((camera) => [
        camera.id,
        subscriptionByCamera.get(camera.id)?.planCode ??
          (camera.planCode as CommercialPlanCode),
      ]),
    ),
  );

  const includedCameras = cameras.filter(
    (camera) => selection[camera.id] !== null,
  );

  const pricing = useMemo(
    () =>
      calculateVolumePricing({
        selections: cameras.flatMap((camera) => {
          const planCode = selection[camera.id];
          if (!planCode) return [];

          return [{
            cameraId: camera.id,
            cameraName: camera.name,
            planCode,
          }];
        }),
        plans,
        tiers,
      }),
    [cameras, plans, selection, tiers],
  );

  const payload = cameras.flatMap((camera) => {
    const planCode = selection[camera.id];
    if (!planCode) return [];

    return [{
      cameraId: camera.id,
      planCode,
    }];
  });

  if (!cameras.length) {
    return (
      <section className={styles.emptyState}>
        <span>PLANOS POR CÂMERA</span>
        <h2>Cadastre a primeira câmera</h2>
        <p>
          Depois do cadastro, esta página calculará
          automaticamente os planos e o desconto progressivo.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className={styles.planGrid}>
        {plans.map((plan) => (
          <article
            className={styles.planCard}
            key={plan.code}
            style={
              plan.code === "intensive"
                ? {
                    borderColor: "#9edfc8",
                    boxShadow: "0 16px 42px rgba(24, 129, 91, 0.13)",
                  }
                : plan.code === "standard"
                  ? {
                      borderColor: "#e0e7ef",
                      boxShadow: "0 12px 34px rgba(15, 31, 52, 0.05)",
                    }
                  : undefined
            }
          >
            <span className={styles.planEyebrow}>
              {plan.code === "basic"
                ? "ENTRADA ACESSÍVEL"
                : plan.code === "standard"
                  ? "EQUILÍBRIO E CONTEXTO"
                  : "MAIS RECOMENDADO"}
            </span>
            <h2>{plan.displayName}</h2>
            <p>{plan.shortDescription}</p>
            <strong className={styles.planPrice}>
              {formatBrl(plan.amountCents)}
              <small>/câmera a cada 30 dias</small>
            </strong>
            <ul>{planFeatures(plan)}</ul>
          </article>
        ))}
      </section>

      <form
        action={createDraftInvoiceAction}
        className={styles.builderGrid}
      >
        <input
          type="hidden"
          name="camera_plans"
          value={JSON.stringify(payload)}
        />

        <section className={styles.cameraPanel}>
          <div className={styles.sectionHeading}>
            <div>
              <span>CONFIGURAÇÃO REAL</span>
              <h2>Escolha o plano de cada câmera</h2>
            </div>
            <small>
              {includedCameras.length} de {cameras.length}{" "}
              {cameras.length === 1
                ? "câmera incluída"
                : "câmeras incluídas"}
            </small>
          </div>

          <p
            style={{
              margin: "10px 0 0",
              color: "#6f7e91",
              fontSize: "12px",
              lineHeight: 1.55,
            }}
          >
            Você não precisa contratar todas as câmeras cadastradas.
            Marque “Não utilizar” nas que não entrarão nesta cobrança.
          </p>

          <div className={styles.cameraList}>
            {cameras.map((camera) => {
              const subscription =
                subscriptionByCamera.get(camera.id);
              const excluded =
                selection[camera.id] === null;
              const canExclude =
                canExcludeSubscription(subscription);

              return (
                <article
                  className={styles.cameraRow}
                  key={camera.id}
                  style={
                    excluded
                      ? {
                          background: "#f7f8fa",
                          borderColor: "#d9e0e8",
                        }
                      : undefined
                  }
                >
                  <div className={styles.cameraIdentity}>
                    <span
                      className={
                        camera.status === "online"
                          ? styles.onlineDot
                          : styles.offlineDot
                      }
                      aria-hidden="true"
                    />
                    <div>
                      <strong>{camera.name}</strong>
                      <small>
                        {camera.siteName}
                        {excluded
                          ? " · não será incluída na cobrança"
                          : subscription
                            ? ` · ${subscription.status}`
                            : " · ainda sem assinatura"}
                      </small>
                    </div>
                  </div>

                  <div
                    className={styles.planButtons}
                    aria-label={`Plano da câmera ${camera.name}`}
                  >
                    {plans.map((plan) => {
                      const selected =
                        selection[camera.id] === plan.code;

                      return (
                        <button
                          type="button"
                          key={plan.code}
                          className={
                            selected
                              ? styles.planButtonSelected
                              : styles.planButton
                          }
                          aria-pressed={selected}
                          disabled={!canManage}
                          onClick={() =>
                            setSelection((current) => ({
                              ...current,
                              [camera.id]: plan.code,
                            }))
                          }
                        >
                          <strong>{plan.displayName}</strong>
                          <small>
                            {formatBrl(plan.amountCents)}
                          </small>
                        </button>
                      );
                    })}

                    {canExclude ? (
                      <button
                        type="button"
                        disabled={!canManage}
                        aria-pressed={excluded}
                        onClick={() =>
                          setSelection((current) => ({
                            ...current,
                            [camera.id]: null,
                          }))
                        }
                        style={{
                          gridColumn: "1 / -1",
                          minHeight: "34px",
                          border: excluded
                            ? "1px solid #9aa8b8"
                            : "1px dashed #c4ced9",
                          borderRadius: "10px",
                          background: excluded
                            ? "#e9edf2"
                            : "#ffffff",
                          color: excluded
                            ? "#34465b"
                            : "#6d7b8d",
                          fontSize: "11px",
                          fontWeight: 800,
                          cursor: canManage ? "pointer" : "default",
                        }}
                      >
                        {excluded
                          ? "✓ Não utilizar esta câmera"
                          : "Não utilizar esta câmera"}
                      </button>
                    ) : (
                      <small
                        style={{
                          gridColumn: "1 / -1",
                          color: "#738094",
                          fontSize: "10px",
                          lineHeight: 1.45,
                        }}
                      >
                        Esta câmera já possui assinatura em andamento.
                        A retirada dela da cobrança deve respeitar o ciclo atual.
                      </small>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.summaryCard}>
          <span className={styles.summaryEyebrow}>
            RESUMO MENSAL
          </span>
          <h2>Uma única cobrança</h2>

          <p
            style={{
              margin: "-8px 0 16px",
              color: "#738094",
              fontSize: "11px",
            }}
          >
            {includedCameras.length} de {cameras.length} câmera(s)
            incluída(s).
          </p>

          <div className={styles.summaryItems}>
            {pricing.items.length ? (
              pricing.items.map((item) => (
                <div key={item.cameraId}>
                  <span>
                    <strong>{item.cameraName}</strong>
                    <small>
                      {item.planName}
                      {item.discountBasisPoints > 0
                        ? ` · ${item.discountBasisPoints / 100}% de desconto`
                        : ""}
                    </small>
                  </span>
                  <b>{formatBrl(item.totalAmountCents)}</b>
                </div>
              ))
            ) : (
              <div
                style={{
                  display: "block",
                  color: "#738094",
                  fontSize: "12px",
                  lineHeight: 1.55,
                }}
              >
                Nenhuma câmera incluída. Escolha ao menos uma para
                preparar a cobrança.
              </div>
            )}
          </div>

          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatBrl(pricing.subtotalCents)}</dd>
            </div>
            <div>
              <dt>Desconto progressivo</dt>
              <dd>
                − {formatBrl(pricing.discountCents)}
              </dd>
            </div>
            <div className={styles.totalRow}>
              <dt>Total a cada 30 dias</dt>
              <dd>{formatBrl(pricing.totalCents)}</dd>
            </div>
          </dl>

          <p className={styles.nextDiscount}>
            {nextDiscountMessage(includedCameras.length, tiers)}
          </p>

          {canManage ? (
            <>
              <SubmitButton
                disabled={includedCameras.length === 0}
              />
              <small className={styles.serverNote}>
                O servidor recalcula o valor e registra um
                snapshot imutável antes da cobrança.
              </small>
            </>
          ) : (
            <p className={styles.readOnlyNote}>
              Somente proprietários e administradores podem
              alterar os planos.
            </p>
          )}
        </aside>
      </form>
    </>
  );
}
