"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  assistantBalanceLabel,
  assistantBalanceTone,
} from "@/src/assistant-commercial/format";
import type { AssistantBalance } from "@/src/assistant-commercial/types";
import styles from "./assistant-balance-card.module.css";

type Props = {
  initialBalance: AssistantBalance;
  hasActiveMcpConnection: boolean;
};

function dateTime(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AssistantBalanceCard({
  initialBalance,
  hasActiveMcpConnection,
}: Props) {
  const [balance, setBalance] = useState(initialBalance);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const response = await fetch("/api/assistant/balance", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          ok: boolean;
          balance?: AssistantBalance;
        };
        if (!cancelled && response.ok && data.ok && data.balance) {
          setBalance(data.balance);
        }
      } catch {
        // O saldo inicial continua válido quando a atualização falha.
      }
    }

    const timer = window.setInterval(refresh, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  function dismissIntegrationsCard() {
    setDismissed(true);
  }

  if (balance.unlimited) {
    if (dismissed) return null;

    return (
      <section
        className={`${styles.card} ${styles.integrations} ${
          hasActiveMcpConnection ? styles.connected : ""
        }`}
      >
        <div className={styles.icon} aria-hidden="true">
          ✦
        </div>
        <div className={styles.content}>
          <span>
            {hasActiveMcpConnection
              ? "CONEXÃO ATIVA"
              : "PESQUISA EM QUALQUER IA"}
          </span>
          <strong>
            {hasActiveMcpConnection
              ? "Você já possui uma conexão ativa via MCP"
              : "Use o MonitorIA na IA de sua preferência"}
          </strong>
          {!hasActiveMcpConnection ? (
            <p>
              Conecte o MonitorIA ao seu aplicativo de IA preferido e consulte
              por lá as informações da sua organização.
            </p>
          ) : null}
        </div>
        <Link href="/dashboard/profile/mcp-connections">
          {hasActiveMcpConnection ? "Ver conexão" : "Ver integrações"}
        </Link>
        <button
          type="button"
          className={styles.dismissButton}
          onClick={dismissIntegrationsCard}
          aria-label="Fechar aviso de integrações"
          title="Fechar"
        >
          ×
        </button>
      </section>
    );
  }

  const tone = assistantBalanceTone(balance);
  const resetAt = dateTime(balance.nextResetAt);
  const expiryAt = dateTime(balance.nextPurchasedExpiryAt);

  return (
    <section className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.icon} aria-hidden="true">
        ✦
      </div>
      <div className={styles.content}>
        <span>FRANQUIA DO ASSISTENTE</span>
        <strong>{assistantBalanceLabel(balance)}</strong>
        {balance.blockReason === "subscription_or_trial_required" ? (
          <p>
            Pacotes extras permanecem guardados, mas o Assistente só funciona
            durante um trial válido ou uma assinatura ativa.
          </p>
        ) : (
          <p>
            {balance.includedRemaining.toLocaleString("pt-BR")} incluídas
            disponíveis
            {balance.purchasedRemaining
              ? ` · ${balance.purchasedRemaining.toLocaleString("pt-BR")} extras`
              : ""}
            {resetAt ? ` · renovação em ${resetAt}` : ""}
            {expiryAt ? ` · próximo pacote expira em ${expiryAt}` : ""}
          </p>
        )}
      </div>
      <Link
        href={
          balance.blockReason === "subscription_or_trial_required"
            ? "/dashboard/plans"
            : "/dashboard/assistant-credits"
        }
      >
        {balance.blockReason === "subscription_or_trial_required"
          ? "Ver planos"
          : balance.accessAllowed
            ? "Ver saldo e pacotes"
            : "Comprar interações"}
      </Link>
    </section>
  );
}
