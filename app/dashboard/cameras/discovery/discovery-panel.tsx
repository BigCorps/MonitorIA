"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  cancelDiscoveryAction,
  getDiscoveryStatusAction,
  startDiscoveryAction,
  type DiscoveryStatus,
  type DiscoveryStartState,
} from "./actions";
import styles from "./discovery.module.css";

const initialState: DiscoveryStartState = { status: "idle" };

/**
 * Texto de espera por etapa.
 *
 * Nenhum deles é uma barra girando sem explicação: o cliente sempre lê o que
 * está acontecendo e por que ainda não terminou.
 */
const stepLabels: Record<string, string> = {
  queued: "Avisando o programa da loja. Isso leva poucos segundos.",
  starting: "O programa da loja começou a procurar.",
  scanning: "Procurando câmeras na rede da loja.",
  testing: "Testando a imagem de cada câmera encontrada.",
  saving: "Salvando as câmeras encontradas.",
  done: "Busca concluída.",
};

function deviceTitle(device: DiscoveryStatus["devices"][number]) {
  const parts = [device.vendor, device.model].filter(Boolean);
  if (device.name) return device.name;
  if (parts.length) return parts.join(" ");
  return `Aparelho em ${device.host}`;
}

export function DiscoveryPanel({ hasAgent }: { hasAgent: boolean }) {
  const [state, formAction, pending] = useActionState(
    startDiscoveryAction,
    initialState,
  );

  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const runIdRef = useRef<string | null>(null);

  const runId = state.status === "started" ? (state.runId ?? null) : null;

  useEffect(() => {
    runIdRef.current = runId;
    if (!runId) return;

    let cancelled = false;

    async function check() {
      try {
        const next = await getDiscoveryStatusAction(runId as string);
        if (!cancelled) setStatus(next);
        return next.status;
      } catch {
        return "unknown" as const;
      }
    }

    void check();

    const timer = setInterval(async () => {
      const current = await check();
      if (
        current === "completed" ||
        current === "failed" ||
        current === "expired" ||
        current === "canceled"
      ) {
        clearInterval(timer);
      }
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId]);

  const running =
    Boolean(runId) &&
    (status === null || status.status === "pending" || status.status === "running");

  const finished =
    status !== null &&
    (status.status === "completed" ||
      status.status === "failed" ||
      status.status === "expired" ||
      status.status === "canceled");

  if (!hasAgent) {
    return (
      <div className={styles.notice}>
        <h2>Falta o programa do MonitorIA no computador da loja</h2>
        <p>
          As câmeras são encontradas pelo computador que fica ligado na loja.
          Instale o programa do MonitorIA nele e volte aqui para procurar as
          câmeras.
        </p>
        <Link className={styles.primaryLink} href="/dashboard/cameras/new">
          Ver como instalar
        </Link>
      </div>
    );
  }

  if (running) {
    const percent = status?.percent ?? 0;
    const label = stepLabels[status?.step ?? "queued"] ?? stepLabels.queued;

    return (
      <div className={styles.progressCard}>
        <h2>Procurando suas câmeras</h2>

        <div
          className={styles.bar}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.max(percent, 4)}%` }} />
        </div>

        <p className={styles.step}>{status?.message ?? label}</p>
        <p className={styles.hint}>
          Isso costuma levar menos de um minuto. Você pode deixar esta tela
          aberta.
        </p>

        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            const current = runIdRef.current;
            if (current) void cancelDiscoveryAction(current);
          }}
        >
          Parar a busca
        </button>
      </div>
    );
  }

  if (finished && status) {
    const connected = status.connected;
    const missing = Math.max(status.cameraCountHint - status.found, 0);

    return (
      <div className={styles.resultCard}>
        {status.status === "completed" ? (
          <>
            <h2>
              {connected === 0
                ? "Nenhuma câmera nova foi conectada"
                : connected === 1
                  ? "1 câmera conectada"
                  : `${connected} câmeras conectadas`}
            </h2>

            {status.alreadyConnected > 0 ? (
              <p className={styles.hint}>
                {status.alreadyConnected === 1
                  ? "Outra câmera já estava conectada antes."
                  : `Outras ${status.alreadyConnected} câmeras já estavam conectadas antes.`}
              </p>
            ) : null}

            {missing > 0 ? (
              <p className={styles.hint}>
                Você disse que tem {status.cameraCountHint}
                {status.cameraCountHint === 1 ? " câmera" : " câmeras"} e
                encontramos {status.found}. Confira se as que faltam estão
                ligadas e no mesmo roteador do computador, e procure de novo.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h2>A busca não terminou</h2>
            <p className={styles.failure}>
              {status.failureMessage ??
                "Não encontramos nenhuma câmera nesta rede. Confira se elas estão ligadas e no mesmo roteador do computador."}
            </p>
          </>
        )}

        {status.devices.length > 0 ? (
          <ul className={styles.deviceList}>
            {status.devices.map((device) => (
              <li key={device.host} className={styles.device}>
                <div>
                  <strong>{deviceTitle(device)}</strong>
                  <span className={styles.host}>{device.host}</span>
                </div>
                <span
                  className={
                    device.connected ? styles.badgeOk : styles.badgeFail
                  }
                >
                  {device.connected
                    ? "Conectada"
                    : (device.failureMessage ?? "Não conseguimos a imagem")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={styles.actions}>
          <Link className={styles.primaryLink} href="/dashboard/cameras">
            Ver minhas câmeras
          </Link>
          <a className={styles.secondaryLink} href="/dashboard/cameras/discovery">
            Procurar de novo
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form}>
      <h2>Vamos encontrar suas câmeras</h2>
      <p className={styles.hint}>
        O computador da loja procura as câmeras que estão no mesmo roteador que
        ele. Você só precisa responder duas coisas.
      </p>

      <label className={styles.field}>
        <span>Quantas câmeras você tem?</span>
        <input
          type="number"
          name="cameraCount"
          min={1}
          max={64}
          defaultValue={4}
          required
        />
      </label>

      <label className={styles.field}>
        <span>Usuário das câmeras</span>
        <input
          type="text"
          name="username"
          autoComplete="off"
          defaultValue="admin"
          required
        />
        <small>
          Vem escrito no manual ou numa etiqueta do gravador. Quase sempre é
          admin.
        </small>
      </label>

      <label className={styles.field}>
        <span>Senha das câmeras</span>
        <input type="password" name="password" autoComplete="off" />
        <small>
          Usamos a senha só durante a busca e apagamos assim que ela termina.
        </small>
      </label>

      {state.status === "error" ? (
        <p className={styles.failure}>{state.message}</p>
      ) : null}

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Começando..." : "Procurar câmeras"}
      </button>
    </form>
  );
}
