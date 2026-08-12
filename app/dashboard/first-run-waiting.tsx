"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getFirstRunStatusAction,
  type FirstRunStage,
} from "./first-run-status";
import styles from "./overview.module.css";

type Props = {
  /** Etapa que o servidor renderizou nesta carga da página. */
  stage: FirstRunStage;
  /** Texto do que estamos esperando, mostrado ao lado do círculo. */
  waitingFor: string;
  detail?: string;
};

/**
 * Espera ativa entre as etapas do primeiro acesso.
 *
 * Pergunta ao servidor de quatro em quatro segundos e recarrega a tela quando
 * a etapa muda. Sem isto, o cliente ficava olhando o passo 1 depois de o
 * instalador já ter concluído, e o passo 3 sem imagem depois de a câmera já
 * estar online — nos dois casos, só apertando F5 ele descobria que tinha
 * dado certo.
 */
export function FirstRunWaiting({ stage, waitingFor, detail }: Props) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const relogio = setInterval(() => {
      if (!cancelled) setElapsed((value) => value + 1);
    }, 1_000);

    const consulta = setInterval(async () => {
      try {
        const status = await getFirstRunStatusAction();
        if (!cancelled && status.stage !== stage) router.refresh();
      } catch {
        // Falha de rede momentânea. A próxima tentativa resolve.
      }
    }, 4_000);

    return () => {
      cancelled = true;
      clearInterval(relogio);
      clearInterval(consulta);
    };
  }, [stage, router]);

  return (
    <div className={styles.waitingBox} role="status" aria-live="polite">
      <span className={styles.waitingSpinner} aria-hidden="true" />

      <div>
        <strong>{waitingFor}</strong>
        {detail ? <p>{detail}</p> : null}

        {elapsed >= 90 ? (
          <p className={styles.waitingSlow}>
            Está demorando mais que o normal. Confira se o computador da loja
            continua ligado e conectado à internet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
