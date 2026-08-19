"use client";

import { useActionState, useState } from "react";
import {
  createSitePairingCodeAction,
  type SitePairingState,
} from "./site-pairing-actions";
import { FirstRunWaiting } from "./first-run-waiting";
import styles from "./first-run.module.css";

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
      setCopied(false);
    }
  }

  if (state.status === "success" && state.code) {
    return (
      <>
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
          <p>Digite no instalador. O código vale 15 minutos.</p>
        </div>

        <FirstRunWaiting
          stage={1}
          waitingFor="Esperando o computador se conectar"
          detail="Assim que o pareamento terminar, esta página avança sozinha."
        />
      </>
    );
  }

  return (
    <form action={formAction} className={styles.pairingForm}>
      {state.status === "error" ? (
        <div className="form-alert error">{state.message}</div>
      ) : null}
      <button className="panel-primary-action" type="submit" disabled={pending}>
        {pending ? "Gerando..." : "Gerar código de pareamento"}
      </button>
    </form>
  );
}
