"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  cancelDiscoveryAction,
  getDiscoveryStatusAction,
  startDiscoveryAction,
  type DiscoveryAgentOption,
  type DiscoveryStatus,
  type DiscoveryStartState,
} from "./actions";
import styles from "./discovery.module.css";

const initialState: DiscoveryStartState = { status: "idle" };

const stepLabels: Record<string, string> = {
  queued: "Avisando o Agent deste local. Isso leva poucos segundos.",
  starting: "O Agent começou a procurar.",
  scanning: "Procurando câmeras nesta rede local.",
  testing: "Testando a imagem de cada câmera encontrada.",
  saving: "Salvando as câmeras encontradas.",
  done: "Busca concluída.",
};

const reviewLabels = {
  new_camera: "Nova câmera",
  already_registered: "Já cadastrada",
  linked_other_site: "Outro Local",
  possible_duplicate: "Possível duplicata",
  offline_unavailable: "Indisponível",
} as const;

function deviceTitle(device: DiscoveryStatus["devices"][number]) {
  const parts = [device.vendor, device.model].filter(Boolean);
  if (device.name) return device.name;
  if (parts.length) return parts.join(" ");
  return `Aparelho em ${device.host}`;
}

function DiscoveryReviewPanel({
  status,
  onboarding,
}: {
  status: DiscoveryStatus;
  onboarding: boolean;
}) {
  const review = status.review;
  if (!review || review.items.length === 0) return null;

  const classified =
    review.counts.new_camera +
    review.counts.already_registered +
    review.counts.linked_other_site +
    review.counts.possible_duplicate +
    review.counts.offline_unavailable;

  return (
    <section className={styles.review} aria-label="Revisão da busca de câmeras">
      <div className={styles.reviewHeader}>
        <div>
          <span className={styles.reviewEyebrow}>REVISÃO DA BUSCA</span>
          <h3>O MonitorIA separou o que encontrou</h3>
          <p>
            Em vez de criar cópias silenciosamente, a busca cruza o Local,
            os vínculos existentes e o histórico do cadastro antes de indicar
            o que aconteceu.
          </p>
        </div>
        <span className={styles.reviewTotal}>
          {classified} {classified === 1 ? "item" : "itens"}
        </span>
      </div>

      <div className={styles.reviewSummary}>
        {review.counts.new_camera > 0 ? (
          <span data-kind="new_camera">
            {review.counts.new_camera} nova(s)
          </span>
        ) : null}
        {review.counts.already_registered > 0 ? (
          <span data-kind="already_registered">
            {review.counts.already_registered} já cadastrada(s)
          </span>
        ) : null}
        {review.counts.linked_other_site > 0 ? (
          <span data-kind="linked_other_site">
            {review.counts.linked_other_site} em outro Local
          </span>
        ) : null}
        {review.counts.possible_duplicate > 0 ? (
          <span data-kind="possible_duplicate">
            {review.counts.possible_duplicate} para revisar
          </span>
        ) : null}
        {review.counts.offline_unavailable > 0 ? (
          <span data-kind="offline_unavailable">
            {review.counts.offline_unavailable} indisponível(is)
          </span>
        ) : null}
      </div>

      <ul className={styles.reviewList}>
        {review.items.map((item) => (
          <li key={item.key} className={styles.reviewItem} data-kind={item.kind}>
            <div className={styles.reviewItemCopy}>
              <div className={styles.reviewItemTitle}>
                <strong>{item.title}</strong>
                <span>{reviewLabels[item.kind]}</span>
              </div>
              <p>{item.detail}</p>
              {item.confidence === "probable" ? (
                <small>Correspondência provável — confirme antes de alterar qualquer cadastro.</small>
              ) : null}
            </div>

            {!onboarding && item.cameraId ? (
              <Link
                className={styles.reviewLink}
                href={`/dashboard/cameras/${item.cameraId}`}
              >
                Conferir câmera
              </Link>
            ) : null}
          </li>
        ))}
      </ul>

      {review.hasConflicts ? (
        <div className={styles.assistedCleanup}>
          <strong>Limpeza assistida</strong>
          <p>
            Nada foi apagado, movido de Local ou substituído automaticamente.
            Confira os itens sinalizados e mantenha o cadastro que realmente
            corresponde à câmera física.
          </p>
        </div>
      ) : null}
    </section>
  );
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
            Confirme ONVIF/RTSP no app da fabricante. Se a câmera estiver
            online no app mas não aparecer aqui, reinicie-a e aguarde 1–2
            minutos antes da nova busca.
          </p>
        </article>

        <article>
          <strong>DVR ou NVR</strong>
          <p>
            O computador escolhido precisa estar na rede do gravador. O
            MonitorIA compara a imagem dos canais para evitar que aliases do
            mesmo vídeo virem câmeras duplicadas.
          </p>
        </article>

        <article>
          <strong>IP dinâmico ou estático</strong>
          <p>
            Os dois funcionam. DHCP costuma ser mais simples. IP estático
            também funciona, desde que esteja livre e acessível.
          </p>
        </article>

        <article>
          <strong>Usuário e senha</strong>
          <p>
            Cada busca usa um conjunto de credenciais. Se os equipamentos
            usam senhas diferentes, faça uma busca por grupo.
          </p>
        </article>
      </div>
    </details>
  );
}

type Props = {
  hasAgent: boolean;
  agents?: DiscoveryAgentOption[];
  defaultCameraCount?: number;
  onboarding?: boolean;
};

export function DiscoveryPanel({
  hasAgent,
  agents = [],
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
            !next.review?.hasConflicts &&
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
        <h2>Nenhum Agent online</h2>
        <p>
          Conecte o computador que está fisicamente no mesmo local das câmeras
          antes de iniciar a busca.
        </p>
        <Link className={styles.primaryLink} href="/dashboard/installer/pair">
          Conectar computador
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
          A busca ocorre somente na rede do Agent selecionado.
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
    const conflicts = status.review?.hasConflicts === true;

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
                Canais que devolvem a mesma imagem são ignorados como duplicados.
              </p>
            ) : (
              <p className={styles.hint}>Encontramos a quantidade esperada.</p>
            )}

            {failedDevices > 0 ? (
              <p className={styles.hint}>
                Os itens abaixo mostram se o aparelho ficou indisponível ou se
                pode corresponder a um cadastro que já existe.
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
          <ul className={styles.deviceList}>
            {status.devices.map((device) => (
              <li key={device.host} className={styles.device}>
                <div>
                  <strong>{deviceTitle(device)}</strong>
                  <span className={styles.host}>{device.host}</span>
                </div>
                <span
                  className={device.connected ? styles.badgeOk : styles.badgeFail}
                >
                  {device.connected
                    ? "Imagem validada"
                    : device.failureMessage ?? "Não conseguimos a imagem"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <DiscoveryReviewPanel status={status} onboarding={onboarding} />

        {missing > 0 || totalConnected === 0 ? (
          <DiscoveryHelp partial={partial} />
        ) : null}

        {onboarding ? (
          <div className={styles.actions}>
            {totalConnected > 0 ? (
              missing > 0 || conflicts ? (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => {
                    router.replace("/dashboard");
                    router.refresh();
                  }}
                >
                  {conflicts
                    ? "Continuar após revisar"
                    : `Continuar com ${totalConnected} ${
                        totalConnected === 1 ? "câmera" : "câmeras"
                      }`}
                </button>
              ) : (
                <div className={styles.advancing} role="status">
                  <span className={styles.miniSpinner} aria-hidden="true" />
                  Tudo certo. Indo para o passo 3…
                </div>
              )
            ) : (
              <button
                type="button"
                className={styles.secondary}
                onClick={() => window.location.reload()}
              >
                Procurar novamente
              </button>
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

  const onlyAgent = agents.length === 1 ? agents[0] : null;

  return (
    <form action={formAction} className={`${styles.form} ${surfaceClass}`}>
      {!onboarding ? (
        <>
          <h2>Vamos encontrar suas câmeras</h2>
          <p className={styles.hint}>
            Escolha o Agent que está fisicamente na rede que deseja procurar.
          </p>
        </>
      ) : (
        <p className={styles.hint}>
          Confirme a quantidade e informe o usuário e a senha usados nas câmeras.
        </p>
      )}

      <div className={styles.tip}>
        <strong>Um local por Agent</strong>
        <p>
          Empresas podem ter vários locais na mesma conta. A busca abaixo não
          atravessa outras redes.
        </p>
      </div>

      {onlyAgent ? (
        <>
          <input type="hidden" name="agent_id" value={onlyAgent.id} />
          {!onboarding ? (
            <p className={styles.hint}>
              Local selecionado: <strong>{onlyAgent.siteName}</strong> · {onlyAgent.name}
            </p>
          ) : null}
        </>
      ) : agents.length > 1 ? (
        <label className={styles.field}>
          <span>Local / computador</span>
          <select name="agent_id" defaultValue={agents[0]?.id ?? ""} required>
            {agents.map((agent) => (
              <option value={agent.id} key={agent.id}>
                {agent.siteName} — {agent.name}
              </option>
            ))}
          </select>
          <small>A busca será executada somente nesse computador.</small>
        </label>
      ) : null}

      <div className={onboarding ? styles.embeddedFields : undefined}>
        <label className={styles.field}>
          <span>Quantas câmeras você tem neste local?</span>
          <input
            type="number"
            name="cameraCount"
            min={1}
            max={64}
            defaultValue={defaultCameraCount}
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
          ONVIF/RTSP deve estar habilitado. Se um DVR responder vários números
          de canal com a mesma imagem, o Agent mantém somente uma câmera
          visualmente distinta.
        </div>
      </details>
    </form>
  );
}
