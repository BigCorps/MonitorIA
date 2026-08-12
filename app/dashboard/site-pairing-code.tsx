"use client";

import { useActionState, useState } from "react";
import {
  createSitePairingCodeAction,
  type SitePairingState,
} from "./site-pairing-actions";
import styles from "./overview.module.css";

const initial: SitePairingState = { status: "idle" };

export function SitePairingCode() {
  const [state, formAction, pending] = useActionState(
    createSitePairingCodeAction,
    initial,
  );

  const [copied, setCopied] = useState(false);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // Navegador sem permissão de área de transferência. O código continua
      // visível na tela, então o cliente pode digitar.
      setCopied(false);
    }
  }

  if (state.status === "success" && state.code) {
    return (
      <div className={styles.pairingCodeBox}>
        <span>SEU CÓDIGO</span>

        <div className={styles.pairingCodeRow}>
          <strong>{state.code}</strong>
          <button
            type="button"
            className={styles.pairingCopy}
            onClick={() => void copy(state.code as string)}
          >
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>

        <p>
          Digite no instalador. Vale 15 minutos. Se expirar, volte aqui e gere
          outro.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction}>
      {state.status === "error" ? (
        <div className="form-alert error">{state.message}</div>
      ) : null}

      <button
        className="panel-primary-action"
        type="submit"
        disabled={pending}
      >
        {pending ? "Gerando..." : "Gerar código de pareamento"}
      </button>
    </form>
  );
}
