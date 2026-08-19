"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getFirstRunStatusAction,
  type FirstRunStage,
} from "./first-run-status";
import styles from "./first-run.module.css";

type Props = {
  stage: FirstRunStage;
  waitingFor: string;
  detail?: string;
};

export function FirstRunWaiting({ stage, waitingFor, detail }: Props) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const clock = window.setInterval(() => {
      if (!cancelled) setElapsed((value) => value + 1);
    }, 1_000);

    const polling = window.setInterval(async () => {
      try {
        const status = await getFirstRunStatusAction();
        if (!cancelled && status.stage !== stage) router.refresh();
      } catch {
        // Falha temporária. A próxima consulta tenta novamente.
      }
    }, 4_000);

    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(polling);
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
            Está demorando mais que o normal. Confira se o computador continua
            ligado, conectado à internet e na mesma rede das câmeras.
          </p>
        ) : null}
      </div>
    </div>
  );
}
