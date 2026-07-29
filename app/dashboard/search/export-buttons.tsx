"use client";

import { useState } from "react";
import {
  buildEventsJson,
  buildEventsMarkdown,
  type EventExportInput,
} from "@/src/lib/event-export";
import styles from "./search.module.css";

type Props = {
  input: EventExportInput;
};

function download(
  content: string,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([content], {
    type: `${mimeType};charset=utf-8`,
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ input }: Props) {
  const [message, setMessage] = useState("");

  const markdown = buildEventsMarkdown(input);
  const json = buildEventsJson(input);

  async function copy(content: string, label: string) {
    try {
      await navigator.clipboard.writeText(content);
      setMessage(`${label} copiado.`);
    } catch {
      setMessage("Não foi possível copiar automaticamente.");
    }
  }

  return (
    <div className={styles.exportArea}>
      <div>
        <strong>Use os dados onde preferir</strong>
        <p>
          Markdown para leitura e JSON para integrações ou outras IAs.
        </p>
        {message ? <small>{message}</small> : null}
      </div>

      <div className={styles.exportButtons}>
        <button
          type="button"
          onClick={() => copy(markdown, "Markdown")}
        >
          Copiar Markdown
        </button>
        <button
          type="button"
          onClick={() => copy(json, "JSON")}
        >
          Copiar JSON
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              markdown,
              "monitoria-relatorio.md",
              "text/markdown",
            )
          }
        >
          Baixar .md
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              json,
              "monitoria-relatorio.json",
              "application/json",
            )
          }
        >
          Baixar .json
        </button>
      </div>
    </div>
  );
}
