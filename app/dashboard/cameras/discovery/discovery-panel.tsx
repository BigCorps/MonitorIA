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

const initialState: DiscoveryStartState = { status: "idle" };

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

function DiscoveryHelp({ partial }: { partial: boolean }) {
  return (
    <details className={styles.help} open>
      <summary>
        {partial
          ? "Não encontrou todas? Tente estas opções"
          : "Se nenhuma câmera aparecer, tente estas opções"}
      </summary>

      <div className={styles.helpGrid}>
        <article>
          <strong>Câmeras de aplicativo / Wi-Fi</strong>
          <p>
            Confirme ONVIF/RTSP no app da fabricante. Se a câmera estiver online
            no app mas não aparecer aqui, reinicie-a e aguarde 1–2 minutos antes
            da nova busca.
          </p>
        </article>

        <article>
          <strong>DVR ou NVR</strong>
          <p>
            O computador e o gravador devem conseguir se comunicar pela rede
            local. Use o usuário e a senha do gravador com ONVIF/RTSP habilitado.
          </p>
        </article>

        <article>
          <strong>IP dinâmico ou estático</strong>
          <p>
            Os dois funcionam. DHCP costuma ser mais simples. IP estático também
            funciona, desde que esteja livre e acessível. Se um IP estático parar
            de responder, teste DHCP e procure novamente.
          </p>
        </article>

        <article>
          <strong>Usuário e senha</strong>
          <p>
            Cada busca usa um conjunto de credenciais. Equipamentos com a mesma
            senha podem ser encontrados juntos. Se usam senhas diferentes, faça
            uma busca por grupo; as já conectadas ficam preservadas.
          </p>
        </article>
      </div>
    </details>
  );
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
  const [state, formAction, pending] = useActionState(
    startDiscoveryAction,
    initialState,
  );
  const [status, setStatus] = useState<DiscoveryStatus | null>(null);
  const runIdRef = useRef<string | null>(null);
  const advanceScheduled = useRef(false);
  const runId = state.status === "started" ? state.runId ?? null : null;

  useEffect(() => {
    runIdRef.current = runId;
    if (!runId) return;

    let cancelled = false;
    let advanceTimer: ReturnType<typeof setTimeout> | null = null;

    async function check() {
      try {
        const next = await getDiscoveryStatusAction(runId as string);

        if (!cancelled) {
          setStatus(next);

          const totalConnected = next.connected + next.alreadyConnected;
          const expected = Math.max(next.cameraCountHint, 1);

          if (
            onboarding &&
            next.status === "completed" &&
            totalConnected >= expected &&
            !advanceScheduled.current
          ) {
            advanceScheduled.current = true;
            advanceTimer = setTimeout(() => {
              router.replace("/dashboard");
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

    const timer = setInterval(async () => {
      const current = await check();
      if (["completed", "failed", "expired", "canceled"].includes(current)) {
        clearInterval(timer);
      }
    }, 2_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
  }, [runId, onboarding, router]);

  const running =
    Boolean(runId) &&
    (status === null || status.status === "pending" || status.status === "running");

  const finished =
    status !== null &&
    ["completed", "failed", "expired", "canceled"].includes(status.status);

  const surfaceClass = onboarding ? styles.embedded : "";

  if (!hasAgent) {
    return (
      <div className={`${styles.notice} ${surfaceClass}`}>
        <h2>Falta o programa do MonitorIA no computador da loja</h2>
        <p>
          O computador precisa estar ligado, pareado e na mesma rede das câmeras
          antes de iniciar a busca.
        </p>
        <Link className={styles.primaryLink} href="/dashboard">
          Voltar ao passo de conexão
        </Link>
      </div>
    );
  }

  if (running) {
    const percent = status?.percent ?? 0;
    const label = stepLabels[status?.step ?? "queued"] ?? stepLabels.queued;

    return (
      <div className={`${styles.progressCard} ${surfaceClass}`}>
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
          Costuma levar de um a cinco minutos. Não feche esta página.
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
    const totalConnected = status.connected + status.alreadyConnected;
    const missing = Math.max(status.cameraCountHint - totalConnected, 0);
    const partial = totalConnected > 0 && missing > 0;
    const failedDevices = status.devices.filter((device) => !device.connected).length;

    return (
      <div className={`${styles.resultCard} ${surfaceClass}`}>
        {status.status === "completed" ? (
          <>
            <h2>
              {totalConnected === 0
                ? "Nenhuma câmera foi conectada"
                : totalConnected === 1
                  ? "1 câmera está conectada"
                  : `${totalConnected} câmeras estão conectadas`}
            </h2>

            {missing > 0 ? (
              <p className={styles.hint}>
                Você informou {status.cameraCountHint} câmera(s). Ainda faltam {missing}.
                As que já foram conectadas serão preservadas.
              </p>
            ) : (
              <p className={styles.hint}>
                Encontramos a quantidade esperada. Você pode seguir para dar nomes às câmeras.
              </p>
            )}

            {failedDevices > 0 ? (
              <p className={styles.hint}>
                Aparelhos sem a marca “Pronta” podem não ser câmeras compatíveis.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <h2>A busca não terminou</h2>
            <p className={styles.failure}>
              {status.failureMessage ?? "Não encontramos nenhuma câmera nesta rede."}
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
                <span className={device.connected ? styles.badgeOk : styles.badgeFail}>
                  {device.connected
                    ? "Pronta"
                    : device.failureMessage ?? "Não conseguimos a imagem"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {missing > 0 || totalConnected === 0 ? (
          <DiscoveryHelp partial={partial} />
        ) : null}

        {onboarding ? (
          <div className={styles.actions}>
            {totalConnected > 0 ? (
              missing > 0 ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    router.replace("/dashboard");
                    router.refresh();
                  }}
                >
                  Continuar com {totalConnected} {totalConnected === 1 ? "câmera" : "câmeras"}
                </button>
              ) : (
                <div className={styles.advancing} role="status">
                  <span className={styles.miniSpinner} aria-hidden="true" />
                  Tudo certo. Indo para o passo 3…
                </div>
              )
            ) : (
              <a className={styles.secondaryLink} href="/dashboard">
                Procurar novamente
              </a>
            )}
          </div>
        ) : (
          <div className={styles.actions}>
            {totalConnected > 0 ? (
              <Link className={styles.primaryLink} href="/dashboard/cameras/setup">
                Dar nome às câmeras
              </Link>
            ) : null}
            <a className={styles.secondaryLink} href="/dashboard/cameras/discovery">
              Procurar de novo
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className={`${styles.form} ${surfaceClass}`}>
      {!onboarding ? (
        <>
          <h2>Vamos encontrar suas câmeras</h2>
          <p className={styles.hint}>
            O computador procura as câmeras na rede local. Informe a quantidade
            e as credenciais usadas nelas.
          </p>
        </>
      ) : (
        <p className={styles.hint}>
          Confirme a quantidade e informe o usuário e a senha usados nas câmeras.
          As credenciais são apagadas quando a busca termina.
        </p>
      )}

      <div className={styles.tip}>
        <strong>O nome será escolhido depois</strong>
        <p>
          Primeiro encontramos os aparelhos reais. No passo 3 você identifica
          cada câmera pela primeira imagem captada.
        </p>
      </div>

      <div className={onboarding ? styles.embeddedFields : undefined}>
        <label className={styles.field}>
          <span>Quantas câmeras você tem?</span>
          <input
            type="number"
            name="cameraCount"
            min={1}
            max={64}
            defaultValue={defaultCameraCount}
            required
          />
          <small>Já trouxemos a quantidade informada no cadastro.</small>
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
        </label>

        <label className={styles.field}>
          <span>Senha das câmeras</span>
          <input type="password" name="password" autoComplete="off" />
          <small>Uma busca usa um conjunto de usuário e senha.</small>
        </label>
      </div>

      {state.status === "error" ? (
        <p className={styles.failure}>{state.message}</p>
      ) : null}

      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Começando..." : "Procurar câmeras"}
      </button>

      <details className={styles.help}>
        <summary>Dicas antes da busca</summary>
        <div className={styles.helpCompact}>
          ONVIF/RTSP deve estar habilitado. IP dinâmico e estático são
          compatíveis. Se equipamentos usam senhas diferentes, faça uma busca
          para cada conjunto de credenciais.
        </div>
      </details>
    </form>
  );
}
