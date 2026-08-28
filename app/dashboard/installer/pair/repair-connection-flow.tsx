"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { RepairDiscoveryPanel } from "./repair-discovery-panel";
import {
  createRepairPairingCodeAction,
  getRepairPairingStatusAction,
  type RepairPairingState,
} from "./actions";
import styles from "./pair.module.css";

const initialPairingState: RepairPairingState = { status: "idle" };

type Props = {
  existingCameraCount: number;
};

type Stage = 1 | 2 | 3;

export function RepairConnectionFlow({ existingCameraCount }: Props) {
  const [pairing, formAction, pairingPending] = useActionState(
    createRepairPairingCodeAction,
    initialPairingState,
  );
  const [stage, setStage] = useState<Stage>(1);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [connectedAgentId, setConnectedAgentId] = useState<string | null>(null);
  const [connectedCameras, setConnectedCameras] = useState(0);

  const phases = useMemo(
    () => [
      { id: 1 as const, label: "Conectar" },
      { id: 2 as const, label: "Procurar" },
      { id: 3 as const, label: "Concluir" },
    ],
    [],
  );

  useEffect(() => {
    if (pairing.status === "success" && pairing.startedAt) {
      setElapsed(0);
    }
  }, [pairing.status, pairing.startedAt]);

  useEffect(() => {
    if (
      pairing.status !== "success" ||
      !pairing.startedAt ||
      stage !== 1
    ) {
      return;
    }

    let cancelled = false;

    const clock = window.setInterval(() => {
      if (!cancelled) setElapsed((value) => value + 1);
    }, 1_000);

    async function check() {
      try {
        const status = await getRepairPairingStatusAction(
          pairing.previousAgentId ?? null,
          pairing.startedAt as string,
        );

        if (!cancelled && status.connected && status.agentId) {
          setConnectedAgentId(status.agentId);
          setStage(2);
        }
      } catch {
        // Falha temporária. A próxima consulta tenta novamente.
      }
    }

    void check();
    const polling = window.setInterval(() => void check(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(polling);
    };
  }, [pairing, stage]);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_500);
    } catch {
      setCopied(false);
    }
  }

  const finishDiscovery = useCallback(
    (result: { connected: number; alreadyConnected: number }) => {
      setConnectedCameras(result.connected + result.alreadyConnected);
      setStage(3);
    },
    [],
  );

  const expired =
    pairing.status === "success" &&
    pairing.expiresAt &&
    Date.now() >= Date.parse(pairing.expiresAt);

  return (
    <>
      <div className={styles.progress} aria-label="Etapas da troca de computador">
        {phases.map((phase) => {
          const done = phase.id < stage;
          const current = phase.id === stage;

          return (
            <article
              key={phase.id}
              data-complete={done}
              data-current={current}
            >
              <span>{done ? "✓" : phase.id}</span>
              <div>
                <strong>{phase.label}</strong>
                <small>{done ? "Concluído" : current ? "Agora" : "Depois"}</small>
              </div>
            </article>
          );
        })}
      </div>

      {stage === 1 ? (
        <section className={styles.stageCard}>
          <div className={styles.stageHeading}>
            <span>PASSO 1 DE 3</span>
            <h2>Conecte a nova instalação</h2>
            <p>
              Deixe a tela “Conectar este computador ao MonitorIA” aberta na
              nova instalação. Pare a edição anterior antes de usar o código.
            </p>
          </div>

          {pairing.status !== "success" ? (
            <form action={formAction} className={styles.generator}>
              {pairing.status === "error" ? (
                <div className="form-alert error">{pairing.message}</div>
              ) : null}
              <button
                className="panel-primary-action"
                type="submit"
                disabled={pairingPending}
              >
                {pairingPending ? "Gerando..." : "Gerar código de conexão"}
              </button>
            </form>
          ) : (
            <>
              <div className={styles.pairingCodeBox}>
                <span>SEU CÓDIGO</span>
                <div className={styles.pairingCodeRow}>
                  <strong>{pairing.code}</strong>
                  <button
                    type="button"
                    onClick={() => void copy(pairing.code as string)}
                  >
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <p>Digite na nova instalação. O código vale 15 minutos.</p>
              </div>

              {!expired ? (
                <div className={styles.waitingBox} role="status" aria-live="polite">
                  <span className={styles.spinner} aria-hidden="true" />
                  <div>
                    <strong>Esperando o novo computador se conectar</strong>
                    <p>
                      Assim que o primeiro heartbeat chegar, o passo 2 abre
                      automaticamente. Não é necessário atualizar a página.
                    </p>
                    {elapsed >= 90 ? (
                      <p className={styles.waitingSlow}>
                        Está demorando mais que o normal. Confirme se a nova
                        instalação continua aberta e com acesso à internet.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className={styles.expiredBox}>
                  <strong>O código expirou</strong>
                  <p>Gere outro código e informe-o na nova instalação.</p>
                  <form action={formAction}>
                    <button
                      className="panel-primary-action"
                      type="submit"
                      disabled={pairingPending}
                    >
                      {pairingPending ? "Gerando..." : "Gerar novo código"}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {stage === 2 ? (
        <section className={styles.stageCard}>
          <div className={styles.stageHeading}>
            <span>PASSO 2 DE 3</span>
            <h2>Reencontre as câmeras deste local</h2>
            <p>
              O novo Agent já está conectado
              {connectedAgentId ? " ao painel" : ""}. Agora informe uma vez o
              usuário e a senha das câmeras. A busca usa o mesmo fluxo validado
              do primeiro acesso e preserva os registros existentes.
            </p>
          </div>

          <RepairDiscoveryPanel
            defaultCameraCount={Math.max(existingCameraCount, 1)}
            onCompleted={finishDiscovery}
          />
        </section>
      ) : null}

      {stage === 3 ? (
        <section className={`${styles.stageCard} ${styles.successCard}`}>
          <div className={styles.successIcon} aria-hidden="true">
            ✓
          </div>
          <div>
            <span className={styles.successEyebrow}>TROCA CONCLUÍDA</span>
            <h2>Novo computador conectado</h2>
            <p>
              {connectedCameras === 1
                ? "1 câmera foi reassociada."
                : `${connectedCameras} câmeras foram reassociadas.`}{" "}
              O histórico e as configurações das câmeras existentes foram
              preservados.
            </p>
            <div className={styles.finishActions}>
              <Link href="/dashboard/cameras" className="panel-primary-action">
                Conferir câmeras
              </Link>
              <Link
                href="/dashboard/installer"
                className="panel-secondary-action"
              >
                Voltar para Instalação
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
