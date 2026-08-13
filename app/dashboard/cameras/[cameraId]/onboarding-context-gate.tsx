"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./onboarding-context-gate.module.css";

type Props = {
  cameraName: string;
  hasFrame: boolean;
  profileReady: boolean;
};

export function OnboardingContextGate({
  cameraName,
  hasFrame,
  profileReady,
}: Props) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (profileReady) {
      const timer = window.setTimeout(() => {
        router.replace("/dashboard/commercial-choice");
      }, 1400);
      return () => window.clearTimeout(timer);
    }

    if (hasFrame) return;

    const timer = window.setInterval(() => {
      router.refresh();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [hasFrame, profileReady, router]);

  function refreshNow() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 900);
  }

  if (profileReady) {
    return (
      <section className={styles.successCard}>
        <span className={styles.successIcon}>✓</span>
        <div>
          <span>CONTEXTO CONFIGURADO</span>
          <h2>{cameraName} está pronta</h2>
          <p>
            Agora vamos para a última etapa do primeiro acesso: escolher entre
            testar gratuitamente por 24 horas ou contratar um plano.
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.replace("/dashboard/commercial-choice")}
        >
          Continuar agora
        </button>
      </section>
    );
  }

  if (hasFrame) {
    return (
      <section className={styles.readyCard}>
        <span className={styles.readyIcon}>✓</span>
        <div>
          <span>IMAGEM RECEBIDA</span>
          <strong>A primeira imagem chegou</strong>
          <p>
            Configure o contexto logo abaixo. Depois de aprovar, você seguirá
            automaticamente para escolher o teste grátis ou um plano.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.waitingCard}>
      <div className={styles.spinner} aria-hidden="true" />
      <div className={styles.waitingCopy}>
        <span>AGUARDANDO A PRIMEIRA IMAGEM</span>
        <h2>Estamos esperando uma imagem de {cameraName}</h2>
        <p>
          O computador e a câmera já estão conectados. Assim que a primeira
          imagem chegar, esta página será atualizada automaticamente e a
          configuração do contexto aparecerá aqui.
        </p>
        <small>
          Normalmente leva poucos segundos. Você pode aguardar nesta tela.
        </small>
      </div>
      <button type="button" onClick={refreshNow} disabled={refreshing}>
        {refreshing ? "Atualizando..." : "Atualizar agora"}
      </button>
    </section>
  );
}
