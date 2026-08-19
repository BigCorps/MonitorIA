"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  type DiscoveryStatus,
  type DiscoveryStartState,
} from "./actions";
import styles from "./discovery.module.css";

const initialState: DiscoveryStartState = {
  status: "idle",
};

const stepLabels: Record<string, string> = {
  queued:
    "Avisando o programa da loja. Isso leva poucos segundos.",
  starting:
    "O programa da loja começou a procurar.",
  scanning:
    "Procurando câmeras na rede da loja.",
  testing:
    "Testando a imagem de cada câmera encontrada.",
  saving:
    "Salvando as câmeras encontradas.",
  done: "Busca concluída.",
};

function deviceTitle(
  device: DiscoveryStatus["devices"][number],
) {
  const parts = [
    device.vendor,
    device.model,
  ].filter(Boolean);

  if (device.name) {
    return device.name;
  }

  if (parts.length) {
    return parts.join(" ");
  }

  return `Aparelho em ${device.host}`;
}

type Props = {
  hasAgent: boolean;
  defaultCameraCount?: number;
  onboarding?: boolean;
};

export function DiscoveryPanel({
  hasAgent,
  defaultCameraCount = 4,
  onboarding = false,
}: Props) {
  const router = useRouter();
  const [
    state,
    formAction,
    pending,
  ] = useActionState(
    startDiscoveryAction,
    initialState,
  );
  const [status, setStatus] =
    useState<DiscoveryStatus | null>(null);
  const runIdRef =
    useRef<string | null>(null);
  const advanceScheduled =
    useRef(false);
  const runId =
    state.status === "started"
      ? (state.runId ?? null)
      : null;

  useEffect(() => {
    runIdRef.current = runId;
    if (!runId) return;

    let cancelled = false;
    let advanceTimer:
      | ReturnType<typeof setTimeout>
      | null = null;

    async function check() {
      try {
        const next =
          await getDiscoveryStatusAction(
            runId as string,
          );

        if (!cancelled) {
          setStatus(next);

          const hasConnectedCamera =
            next.connected > 0 ||
            next.alreadyConnected > 0 ||
            next.devices.some(
              (device) =>
                device.connected,
            );

          if (
            onboarding &&
            next.status ===
              "completed" &&
            hasConnectedCamera &&
            !advanceScheduled.current
          ) {
            advanceScheduled.current =
              true;
            advanceTimer =
              setTimeout(() => {
                router.refresh();
              }, 900);
          }
        }

        return next.status;
      } catch {
        return "unknown" as const;
      }
    }

    void check();

    const timer = setInterval(
      async () => {
        const current = await check();

        if (
          [
            "completed",
            "failed",
            "expired",
            "canceled",
          ].includes(current)
        ) {
          clearInterval(timer);
        }
      },
      2_000,
    );

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (advanceTimer) {
        clearTimeout(advanceTimer);
      }
    };
  }, [runId, onboarding, router]);

  const running =
    Boolean(runId) &&
    (status === null ||
      status.status === "pending" ||
      status.status === "running");

  const finished =
    status !== null &&
    [
      "completed",
      "failed",
      "expired",
      "canceled",
    ].includes(status.status);

  const surfaceClass = onboarding
    ? styles.embedded
    : "";

  if (!hasAgent) {
    return (
      <div
        className={`${styles.notice} ${surfaceClass}`}
      >
        <h2>
          Falta o programa do MonitorIA no
          computador da loja
        </h2>
        <p>
          O computador precisa estar ligado,
          pareado e na mesma rede das câmeras
          antes de iniciar a busca.
        </p>
        {onboarding ? (
          <Link
            className={styles.primaryLink}
            href="/dashboard"
          >
            Voltar ao passo de conexão
          </Link>
        ) : (
          <Link
            className={styles.primaryLink}
            href="/dashboard"
          >
            Voltar ao primeiro acesso
          </Link>
        )}
      </div>
    );
  }

  if (running) {
    const percent =
      status?.percent ?? 0;
    const label =
      stepLabels[
        status?.step ?? "queued"
      ] ?? stepLabels.queued;

    return (
      <div
        className={`${styles.progressCard} ${surfaceClass}`}
      >
        <h2>Procurando suas câmeras</h2>
        <div
          className={styles.bar}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            style={{
              width: `${Math.max(
                percent,
                4,
              )}%`,
            }}
          />
        </div>
        <p className={styles.step}>
          {status?.message ?? label}
        </p>
        <p className={styles.hint}>
          Costuma levar de um a cinco
          minutos. Não feche esta página.
        </p>
        <button
          type="button"
          className={styles.secondary}
          onClick={() => {
            const current =
              runIdRef.current;
            if (current) {
              void cancelDiscoveryAction(
                current,
              );
            }
          }}
        >
          Parar a busca
        </button>
      </div>
    );
  }

  if (finished && status) {
    const connected =
      status.connected;
    const working =
      status.devices.filter(
        (device) =>
          device.connected,
      ).length;
    const failed =
      status.devices.length - working;
    const missing = Math.max(
      status.cameraCountHint - working,
      0,
    );
    const hasConnectedCamera =
      connected > 0 ||
      status.alreadyConnected > 0 ||
      working > 0;

    return (
      <div
        className={`${styles.resultCard} ${surfaceClass}`}
      >
        {status.status ===
        "completed" ? (
          <>
            <h2>
              {working === 0
                ? "Nenhuma câmera está enviando imagem"
                : working === 1
                  ? "1 câmera encontrada"
                  : `${working} câmeras encontradas`}
            </h2>

            {connected > 0 ? (
              <p className={styles.hint}>
                {connected === 1
                  ? "1 câmera foi conectada nesta busca."
                  : `${connected} câmeras foram conectadas nesta busca.`}
              </p>
            ) : null}

            {missing > 0 ? (
              <p className={styles.hint}>
                Você informou{" "}
                {status.cameraCountHint}{" "}
                câmera(s). Confira se as
                que faltam estão ligadas e
                na mesma rede e procure
                novamente.
              </p>
            ) : null}

            {working > 0 ? (
              <div className={styles.tip}>
                <strong>
                  Câmeras encontradas
                </strong>
                <p>
                  A próxima etapa é dar um
                  nome real para cada uma.
                </p>
              </div>
            ) : null}

            {failed > 0 ? (
              <p className={styles.hint}>
                Aparelhos sem a marca
                “Pronta” podem não ser
                câmeras. Você pode ignorar
                o que não reconhecer.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h2>A busca não terminou</h2>
            <p className={styles.failure}>
              {status.failureMessage ??
                "Não encontramos nenhuma câmera nesta rede."}
            </p>
          </>
        )}

        {status.devices.length > 0 ? (
          <ul
            className={
              styles.deviceList
            }
          >
            {status.devices.map(
              (device) => (
                <li
                  key={device.host}
                  className={
                    styles.device
                  }
                >
                  <div>
                    <strong>
                      {deviceTitle(device)}
                    </strong>
                    <span
                      className={
                        styles.host
                      }
                    >
                      {device.host}
                    </span>
                  </div>
                  <span
                    className={
                      device.connected
                        ? styles.badgeOk
                        : styles.badgeFail
                    }
                  >
                    {device.connected
                      ? "Pronta"
                      : (device.failureMessage ??
                        "Não conseguimos a imagem")}
                  </span>
                </li>
              ),
            )}
          </ul>
        ) : null}

        {onboarding ? (
          <div
            className={styles.actions}
          >
            {hasConnectedCamera ? (
              <div
                className={
                  styles.advancing
                }
                role="status"
              >
                <span
                  className={
                    styles.miniSpinner
                  }
                  aria-hidden="true"
                />
                Câmera conectada. Indo para
                o passo 3…
              </div>
            ) : (
              <a
                className={
                  styles.secondaryLink
                }
                href="/dashboard"
              >
                Procurar novamente
              </a>
            )}
          </div>
        ) : (
          <div className={styles.actions}>
            {working > 0 ? (
              <Link
                className={
                  styles.primaryLink
                }
                href="/dashboard/cameras/setup"
              >
                Dar nome às câmeras
              </Link>
            ) : null}
            <a
              className={
                styles.secondaryLink
              }
              href="/dashboard/cameras/discovery"
            >
              Procurar de novo
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className={`${styles.form} ${surfaceClass}`}
    >
      {!onboarding ? (
        <>
          <h2>
            Vamos encontrar suas câmeras
          </h2>
          <p className={styles.hint}>
            O computador procura as
            câmeras no mesmo roteador.
            Você só precisa informar
            quantas existem e as
            credenciais usadas nelas.
          </p>
        </>
      ) : (
        <p className={styles.hint}>
          Confirme a quantidade e informe
          o usuário e a senha usados nas
          câmeras. Essas credenciais são
          usadas apenas durante a busca.
        </p>
      )}

      <div className={styles.tip}>
        <strong>
          O nome será escolhido depois
        </strong>
        <p>
          Primeiro encontramos os
          aparelhos reais. No passo 3
          você decide qual é Entrada,
          Caixa, Estoque ou outro nome.
        </p>
      </div>

      <div
        className={
          onboarding
            ? styles.embeddedFields
            : undefined
        }
      >
        <label className={styles.field}>
          <span>
            Quantas câmeras você tem?
          </span>
          <input
            type="number"
            name="cameraCount"
            min={1}
            max={64}
            defaultValue={
              defaultCameraCount
            }
            required
          />
          <small>
            Já trouxemos a quantidade
            informada no primeiro
            cadastro.
          </small>
        </label>

        <label className={styles.field}>
          <span>
            Usuário das câmeras
          </span>
          <input
            type="text"
            name="username"
            autoComplete="off"
            defaultValue="admin"
            required
          />
        </label>

        <label className={styles.field}>
          <span>
            Senha das câmeras
          </span>
          <input
            type="password"
            name="password"
            autoComplete="off"
          />
          <small>
            A senha é apagada quando a
            busca termina.
          </small>
        </label>
      </div>

      {state.status === "error" ? (
        <p className={styles.failure}>
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        className={styles.primary}
        disabled={pending}
      >
        {pending
          ? "Começando..."
          : "Procurar câmeras"}
      </button>
    </form>
  );
}
