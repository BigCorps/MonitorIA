"use client";

import Link from "next/link";
import { useState } from "react";
import type { CameraActionState } from "./camera-action-state";

type Props = {
  state: CameraActionState;
};

export function PairingResult({ state }: Props) {
  const [copied, setCopied] = useState(false);

  if (
    state.status !== "success" ||
    !state.pairingCode ||
    !state.cameraId
  ) {
    return null;
  }

  const expiresAt = state.expiresAt
    ? new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(state.expiresAt))
    : null;

  async function copyCode() {
    await navigator.clipboard.writeText(state.pairingCode ?? "");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="pairing-result">
      <div className="pairing-result-heading">
        <div>
          <span>CÂMERA CRIADA</span>
          <h2>{state.cameraName}</h2>
        </div>
        <span className="online-chip">
          <i /> Aguardando Agent
        </span>
      </div>

      <p>{state.message}</p>

      <div className="pairing-code-box">
        <code>{state.pairingCode}</code>
        <button type="button" onClick={copyCode}>
          {copied ? "Copiado" : "Copiar código"}
        </button>
      </div>

      <small>
        Válido por 15 minutos{expiresAt ? `, até ${expiresAt}` : ""}. O código
        legível é exibido somente agora.
      </small>

      <div className="camera-security-note">
        <strong>Agora baixe e abra o MonitorIA no computador da loja.</strong>
        <p>
          O instalador pedirá este código e, na tela seguinte, o usuário e a
          senha das câmeras. Os endereços serão encontrados automaticamente.
        </p>
      </div>

      <div className="pairing-result-actions">
        <a href="/api/installer/windows" className="panel-primary-action">
          Baixar MonitorIA para Windows
        </a>
        <Link
          href={`/dashboard/cameras/${state.cameraId}`}
          className="panel-secondary-action"
        >
          Abrir câmera
        </Link>
        <Link href="/dashboard/cameras" className="panel-secondary-action">
          Ver todas
        </Link>
      </div>
    </section>
  );
}
