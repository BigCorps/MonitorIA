"use client";

import { useEffect, useRef, useState } from "react";
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
  multiCameraSelection?: boolean;
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

export function EventExportButtons({
  filters,
  total,
  multiCameraSelection = false,
}: Props) {
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");

    const syncDisclosure = () => {
      if (!disclosureRef.current) return;

      // Desktop: exportação fica visível sem clique.
      // Mobile: começa recolhida e continua usando o comportamento nativo
      // do <details> para abrir/fechar pelo usuário.
      disclosureRef.current.open = media.matches;
    };

    syncDisclosure();
    media.addEventListener("change", syncDisclosure);

    return () => {
      media.removeEventListener("change", syncDisclosure);
    };
  }, []);

  async function copy(format: "md" | "json") {
    if (multiCameraSelection) {
      setStatus("Para exportar, use Todas as câmeras ou selecione apenas uma câmera.");
      return;
    }

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
    if (multiCameraSelection) {
      setStatus("Para exportar, use Todas as câmeras ou selecione apenas uma câmera.");
      return;
    }
    window.location.href = exportUrl(filters, format, true);
  }

  return (
    <details ref={disclosureRef} className={disclosureStyles.disclosure}>
      <summary className={disclosureStyles.summary}>
        <span className={disclosureStyles.summaryCopy}>
          <span>EXPORTAR PERÍODO</span>
          <strong>
            {total} acontecimento{total === 1 ? "" : "s"} em Markdown ou JSON
          </strong>
          <small>
            {multiCameraSelection
              ? "Seleções com várias câmeras podem ser consultadas na tela; exporte Todas ou uma câmera por vez"
              : "Toque para ver as opções de copiar e baixar"}
          </small>
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
              disabled={pending || multiCameraSelection}
              onClick={() => void copy("md")}
            >
              Copiar Markdown
            </button>
            <button
              type="button"
              disabled={pending || multiCameraSelection}
              onClick={() => void copy("json")}
            >
              Copiar JSON
            </button>
            <button
              type="button"
              disabled={multiCameraSelection}
              onClick={() => download("md")}
            >
              Baixar .md
            </button>
            <button
              type="button"
              disabled={multiCameraSelection}
              onClick={() => download("json")}
            >
              Baixar .json
            </button>
          </div>
        </section>
      </div>
    </details>
  );
}
