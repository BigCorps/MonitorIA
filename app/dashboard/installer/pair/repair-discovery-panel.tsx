"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  cancelDiscoveryAction,
  getDiscoveryStatusAction,
  startDiscoveryAction,
  type DiscoveryStartState,
  type DiscoveryStatus,
} from "../../cameras/discovery/actions";
import discoveryStyles from "../../cameras/discovery/discovery.module.css";

const initialState: DiscoveryStartState = { status: "idle" };

const stepLabels: Record<string, string> = {
  queued: "Avisando o novo programa da loja.",
  starting: "O novo programa começou a procurar.",
  scanning: "Procurando câmeras na rede da loja.",
  testing: "Testando a imagem de cada câmera encontrada.",
  saving: "Reassociando as câmeras ao histórico existente.",
  done: "Busca concluída.",
};

type Props = {
  defaultCameraCount: number;
  onCompleted: (result: {
    connected: number;
    alreadyConnected: number;
  }) => void;
};

export function RepairDiscoveryPanel({
  defaultCameraCount,
  onCompleted,
}: Props) {
  const [state, formAction, pending] = useActionState(
    startDiscoveryAction,
    initialState,
  );
  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const runIdRef = useRef<string | null>(null);
  const completionSent = useRef(false);
  const runId = state.status === "started" ? state.runId ?? null : null;

  useEffect(() => {
    runIdRef.current = runId;
    if (!runId) return;

    let cancelled = false;
    let completionTimer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const next = await getDiscoveryStatusAction(runId as string);

        if (!cancelled) {
          setStatus(next);

          const totalConnected = next.connected + next.alreadyConnected;
          const expected = Math.max(next.cameraCountHint, 1);

          if (
            next.status === "completed" &&
            totalConnected >= expected &&
            !completionSent.current
          ) {
            completionSent.current = true;
            completionTimer = setTimeout(() => {
              onCompleted({
                connected: next.connected,
                alreadyConnected: next.alreadyConnected,
              });
            }, 900);
          }
        }

        return next.status;
      } catch {
        return "unknown" as const;
      }
    }

    void check();

    const timer = window.setInterval(async () => {
      const current = await check();
      if (["completed", "failed", "expired", "canceled"].includes(current)) {
        window.clearInterval(timer);
      }
    }, 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (completionTimer) clearTimeout(completionTimer);
    };
  }, [runId, onCompleted]);

  const running =
    Boolean(runId) &&
    (status === null || status.status === "pending" || status.status === "running");

  const finished =
    status !== null &&
    ["completed", "failed", "expired", "canceled"].includes(status.status);

  if (running) {
    const percent = status?.percent ?? 0;
    const label = stepLabels[status?.step ?? "queued"] ?? stepLabels.queued;

    return (
      <div className={`${discoveryStyles.progressCard} ${discoveryStyles.embedded}`}>
        <h2>Reassociando suas câmeras</h2>
        <div
          className={discoveryStyles.bar}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: `${Math.max(percent, 4)}%` }} />
        </div>
        <p className={discoveryStyles.step}>{status?.message ?? label}</p>
        <p className={discoveryStyles.hint}>
          A tela avança sozinha quando a busca termina. Não feche esta página.
        </p>
        <button
          type="button"
          className={discoveryStyles.secondary}
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
    const totalConnected = status.connected + status.alreadyConnected;
    const missing = Math.max(status.cameraCountHint - totalConnected, 0);

    return (
      <div className={`${discoveryStyles.resultCard} ${discoveryStyles.embedded}`}>
        {status.status === "completed" ? (
          <>
            <h2>
              {totalConnected === 0
                ? "Nenhuma câmera foi reassociada"
                : totalConnected === 1
                  ? "1 câmera foi reassociada"
                  : `${totalConnected} câmeras foram reassociadas`}
            </h2>
            {missing > 0 ? (
              <p className={discoveryStyles.hint}>
                Ainda faltam {missing}. As câmeras já reassociadas continuam
                preservadas.
              </p>
            ) : (
              <div className={discoveryStyles.advancing} role="status">
                <span className={discoveryStyles.miniSpinner} aria-hidden="true" />
                Tudo certo. Finalizando a troca…
              </div>
            )}
          </>
        ) : (
          <>
            <h2>A busca não terminou</h2>
            <p className={discoveryStyles.failure}>
              {status.failureMessage ??
                "Não conseguimos concluir a busca nesta tentativa."}
            </p>
          </>
        )}

        {status.devices.length > 0 ? (
          <ul className={discoveryStyles.deviceList}>
            {status.devices.map((device) => (
              <li key={device.host} className={discoveryStyles.device}>
                <div>
                  <strong>
                    {device.name ||
                      [device.vendor, device.model].filter(Boolean).join(" ") ||
                      "Câmera encontrada"}
                  </strong>
                  <span className={discoveryStyles.host}>{device.host}</span>
                </div>
                <span
                  className={
                    device.connected
                      ? discoveryStyles.badgeOk
                      : discoveryStyles.badgeFail
                  }
                >
                  {device.connected
                    ? "Pronta"
                    : device.failureMessage ?? "Não conseguimos a imagem"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {totalConnected > 0 && missing > 0 ? (
          <div className={discoveryStyles.actions}>
            <button
              type="button"
              className={discoveryStyles.primary}
              onClick={() =>
                onCompleted({
                  connected: status.connected,
                  alreadyConnected: status.alreadyConnected,
                })
              }
            >
              Continuar com {totalConnected}{" "}
              {totalConnected === 1 ? "câmera" : "câmeras"}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className={`${discoveryStyles.form} ${discoveryStyles.embedded}`}
    >
      <p className={discoveryStyles.hint}>
        Informe o usuário e a senha usados nas câmeras. As credenciais são
        temporárias e apagadas quando a busca termina.
      </p>

      <div className={discoveryStyles.tip}>
        <strong>Seu histórico será preservado</strong>
        <p>
          O novo computador vai reencontrar os aparelhos físicos e reassociá-los
          aos registros já existentes deste local, em vez de criar câmeras novas.
        </p>
      </div>

      <div className={discoveryStyles.embeddedFields}>
        <label className={discoveryStyles.field}>
          <span>Quantas câmeras existem neste local?</span>
          <input
            type="number"
            name="cameraCount"
            min={1}
            max={64}
            defaultValue={Math.max(defaultCameraCount, 1)}
            required
          />
          <small>Já trouxemos a quantidade cadastrada no MonitorIA.</small>
        </label>

        <label className={discoveryStyles.field}>
          <span>Usuário das câmeras</span>
          <input
            type="text"
            name="username"
            autoComplete="off"
            defaultValue="admin"
            required
          />
        </label>

        <label className={discoveryStyles.field}>
          <span>Senha das câmeras</span>
          <input type="password" name="password" autoComplete="off" />
          <small>Uma busca usa um conjunto de usuário e senha.</small>
        </label>
      </div>

      {state.status === "error" ? (
        <p className={discoveryStyles.failure}>{state.message}</p>
      ) : null}

      <button
        type="submit"
        className={discoveryStyles.primary}
        disabled={pending}
      >
        {pending ? "Começando..." : "Procurar e reassociar câmeras"}
      </button>
    </form>
  );
}
