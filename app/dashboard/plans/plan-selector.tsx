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

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className={styles.submitButton}
      type="submit"
      disabled={pending}
    >
      {pending
        ? "Preparando fatura..."
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
        Clipe de {plan.clipDurationSeconds}s por{" "}
        {plan.clipRetentionDays} dias
      </Feature>,
    );
  }

  return features;
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
    Record<string, CommercialPlanCode>
  >(() =>
    Object.fromEntries(
      cameras.map((camera) => [
        camera.id,
        subscriptionByCamera.get(camera.id)?.planCode ??
          (camera.planCode as CommercialPlanCode),
      ]),
    ),
  );

  const pricing = useMemo(
    () =>
      calculateVolumePricing({
        selections: cameras.map((camera) => ({
          cameraId: camera.id,
          cameraName: camera.name,
          planCode:
            selection[camera.id] ??
            (camera.planCode as CommercialPlanCode),
        })),
        plans,
        tiers,
      }),
    [cameras, plans, selection, tiers],
  );

  const payload = cameras.map((camera) => ({
    cameraId: camera.id,
    planCode:
      selection[camera.id] ??
      (camera.planCode as CommercialPlanCode),
  }));

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
          <article className={styles.planCard} key={plan.code}>
            <span className={styles.planEyebrow}>
              {plan.code === "basic"
                ? "ENTRADA ACESSÍVEL"
                : plan.code === "standard"
                  ? "MAIS ESCOLHIDO"
                  : "MÁXIMO CONTEXTO"}
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
              {cameras.length}{" "}
              {cameras.length === 1
                ? "câmera cadastrada"
                : "câmeras cadastradas"}
            </small>
          </div>

          <div className={styles.cameraList}>
            {cameras.map((camera) => {
              const subscription =
                subscriptionByCamera.get(camera.id);

              return (
                <article
                  className={styles.cameraRow}
                  key={camera.id}
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
                        {subscription
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

          <div className={styles.summaryItems}>
            {pricing.items.map((item) => (
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
            ))}
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
            {nextDiscountMessage(cameras.length, tiers)}
          </p>

          {canManage ? (
            <>
              <SubmitButton />
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
