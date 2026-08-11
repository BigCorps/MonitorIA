"use client";

import { useActionState } from "react";
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

  if (state.status === "success" && state.code) {
    return (
      <div className={styles.pairingCodeBox}>
        <span>SEU CÓDIGO</span>
        <strong>{state.code}</strong>
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
