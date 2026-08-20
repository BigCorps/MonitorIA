"use client";

import { useState } from "react";
import styles from "./event-export.module.css";
import disclosureStyles from "./mobile-disclosure.module.css";

type Props = {
  filters: {
    from: string;
    to: string;
    site: string;
    camera: string;
    type: string;
    review: string;
  };
  total: number;
};

function exportUrl(
  filters: Props["filters"],
  format: "md" | "json",
  download: boolean,
) {
  const params = new URLSearchParams({
    ...filters,
    format,
    download: download ? "1" : "0",
  });
  return `/api/events/export?${params.toString()}`;
}

export function EventExportButtons({ filters, total }: Props) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  async function copy(format: "md" | "json") {
    setPending(true);
    setStatus("");
    try {
      const response = await fetch(
        exportUrl(filters, format, false),
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("export_failed");
      await navigator.clipboard.writeText(await response.text());
      setStatus(
        `${format === "md" ? "Markdown" : "JSON"} completo copiado.`,
      );
    } catch {
      setStatus("Não foi possível copiar a exportação.");
    } finally {
      setPending(false);
    }
  }

  function download(format: "md" | "json") {
    window.location.href = exportUrl(filters, format, true);
  }

  return (
    <details className={disclosureStyles.disclosure}>
      <summary className={disclosureStyles.summary}>
        <span className={disclosureStyles.summaryCopy}>
          <span>EXPORTAR PERÍODO</span>
          <strong>
            {total} acontecimento{total === 1 ? "" : "s"} em Markdown ou JSON
          </strong>
          <small>Toque para ver as opções de copiar e baixar</small>
        </span>
        <span
          className={disclosureStyles.chevron}
          aria-hidden="true"
        >
          ⌄
        </span>
      </summary>

      <div className={disclosureStyles.content}>
        <section
          className={`${styles.shell} ${disclosureStyles.exportShell}`}
        >
          <div className={styles.icon} aria-hidden="true">
            ⇩
          </div>
          <div className={styles.copy}>
            <span>EXPORTAR O PERÍODO FILTRADO</span>
            <strong>
              {total} acontecimento{total === 1 ? "" : "s"} em Markdown ou JSON
            </strong>
            <p>
              Inclui os resultados visíveis do período e os indicadores
              estimados para uso em relatórios, integrações ou outras IAs.
            </p>
            {status ? <small>{status}</small> : null}
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={pending}
              onClick={() => void copy("md")}
            >
              Copiar Markdown
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => void copy("json")}
            >
              Copiar JSON
            </button>
            <button type="button" onClick={() => download("md")}>
              Baixar .md
            </button>
            <button type="button" onClick={() => download("json")}>
              Baixar .json
            </button>
          </div>
        </section>
      </div>
    </details>
  );
}
