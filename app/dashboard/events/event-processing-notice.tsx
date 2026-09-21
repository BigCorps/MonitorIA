"use client";

import { useEffect, useState } from "react";
import { useDashboardSourceContext } from "../dashboard-source-context";
import styles from "./event-processing-notice.module.css";

export function EventProcessingNotice() {
  const [tick, setTick] = useState(0);
  const { mode } = useDashboardSourceContext();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 1500);

    return () => window.clearInterval(timer);
  }, []);

  const copy =
    mode === "recordings_only"
      ? {
          title: "Resultados das gravações analisadas",
          text:
            "Os acontecimentos desta tela vêm dos arquivos que você analisou. " +
            "Novos registros aparecem quando outra gravação é analisada.",
        }
      : mode === "hybrid"
        ? {
            title: "Câmeras conectadas e gravações no mesmo histórico",
            text:
              "Acontecimentos das câmeras conectadas e dos arquivos analisados aparecem juntos. " +
              "Use os filtros para consultar uma fonte específica.",
          }
        : {
            title:
              "Monitoramento ativo · analisando novos acontecimentos",
            text:
              "Os acontecimentos não aparecem instantaneamente. O MonitorIA acompanha " +
              "o movimento até ele terminar e depois faz a análise com IA. " +
              "Normalmente um novo registro aparece em 1 a 3 minutos após o fim do acontecimento.",
          };

  return (
    <section className={styles.notice}>
      <span className={styles.indicator} aria-hidden="true">
        <i data-tick={tick % 3} />
      </span>

      <div>
        <strong>{copy.title}</strong>
        <p>{copy.text}</p>
      </div>
    </section>
  );
}
