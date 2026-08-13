"use client";

import { useEffect, useState } from "react";
import styles from "./event-processing-notice.module.css";

export function EventProcessingNotice() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className={styles.notice}>
      <span className={styles.indicator} aria-hidden="true">
        <i data-tick={tick % 3} />
      </span>

      <div>
        <strong>Monitoramento ativo · analisando novos acontecimentos</strong>
        <p>
          Os acontecimentos não aparecem instantaneamente. O MonitorIA acompanha
          o movimento até ele terminar e depois faz a análise com IA.
          Normalmente um novo registro aparece em 1 a 3 minutos após o fim do
          acontecimento; movimentos longos podem levar um pouco mais.
        </p>
      </div>
    </section>
  );
}
