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

const initialPairingState: RepairPairingState = {
  status: "idle",
};

type SiteOption = {
  id: string;
  name: string;
  timezone: string;
  cameraCount: number;
};

type Props = {
  sites: SiteOption[];
};

type Stage = 1 | 2 | 3;

export function RepairConnectionFlow({
  sites,
}: Props) {
  const [
    pairing,
    formAction,
    pairingPending,
  ] = useActionState(
    createRepairPairingCodeAction,
    initialPairingState,
  );
  const [stage, setStage] =
    useState<Stage>(1);
  const [elapsed, setElapsed] =
    useState(0);
  const [copied, setCopied] =
    useState(false);
  const [
    connectedAgentId,
    setConnectedAgentId,
  ] = useState<string | null>(
    null,
  );
  const [
    connectedCameras,
    setConnectedCameras,
  ] = useState(0);
  const [
    selectedSiteId,
    setSelectedSiteId,
  ] = useState(
    sites[0]?.id ?? "__new__",
  );

  const phases = useMemo(
    () => [
      {
        id: 1 as const,
        label: "Conectar",
      },
      {
        id: 2 as const,
        label: "Procurar",
      },
      {
        id: 3 as const,
        label: "Concluir",
      },
    ],
    [],
  );

  useEffect(() => {
    if (pairing.siteId) {
      setSelectedSiteId(
        pairing.siteId,
      );
    }
  }, [pairing.siteId]);

  useEffect(() => {
    if (
      pairing.status === "success" &&
      pairing.startedAt
    ) {
      setElapsed(0);
    }
  }, [
    pairing.status,
    pairing.startedAt,
  ]);

  useEffect(() => {
    if (
      pairing.status !== "success" ||
      !pairing.startedAt ||
      !pairing.siteId ||
      stage !== 1
    ) {
      return;
    }

    let cancelled = false;

    const clock =
      window.setInterval(() => {
        if (!cancelled) {
          setElapsed(
            (value) => value + 1,
          );
        }
      }, 1_000);

    async function check() {
      try {
        const status =
          await getRepairPairingStatusAction(
            pairing.siteId as string,
            pairing.previousAgentId ??
              null,
            pairing.startedAt as string,
          );

        if (
          !cancelled &&
          status.connected &&
          status.agentId
        ) {
          setConnectedAgentId(
            status.agentId,
          );
          setStage(2);
        }
      } catch {
        // Falha temporária.
      }
    }

    void check();

    const polling =
      window.setInterval(
        () => void check(),
        2_000,
      );

    return () => {
      cancelled = true;
      window.clearInterval(clock);
      window.clearInterval(
        polling,
      );
    };
  }, [pairing, stage]);

  async function copy(
    code: string,
  ) {
    try {
      await navigator.clipboard.writeText(
        code,
      );
      setCopied(true);
      window.setTimeout(
        () => setCopied(false),
        2_500,
      );
    } catch {
      setCopied(false);
    }
  }

  const finishDiscovery =
    useCallback(
      (result: {
        connected: number;
        alreadyConnected: number;
      }) => {
        setConnectedCameras(
          result.connected +
            result.alreadyConnected,
        );
        setStage(3);
      },
      [],
    );

  const expired =
    pairing.status === "success" &&
    pairing.expiresAt &&
    Date.now() >=
      Date.parse(
        pairing.expiresAt,
      );

  const existingCameraCount =
    sites.find(
      (site) =>
        site.id === pairing.siteId,
    )?.cameraCount ?? 0;

  const selectedExisting =
    selectedSiteId !== "__new__";

  return (
    <>
      <div
        className={styles.progress}
        aria-label="Etapas da conexão"
      >
        {phases.map((phase) => {
          const done =
            phase.id < stage;
          const current =
            phase.id === stage;

          return (
            <article
              key={phase.id}
              data-complete={done}
              data-current={current}
            >
              <span>
                {done
                  ? "✓"
                  : phase.id}
              </span>
              <div>
                <strong>
                  {phase.label}
                </strong>
                <small>
                  {done
                    ? "Concluído"
                    : current
                      ? "Agora"
                      : "Depois"}
                </small>
              </div>
            </article>
          );
        })}
      </div>

      {stage === 1 ? (
        <section
          className={styles.stageCard}
        >
          <div
            className={
              styles.stageHeading
            }
          >
            <span>PASSO 1 DE 3</span>
            <h2>
              Escolha o local deste
              computador
            </h2>
            <p>
              Use um local existente
              quando estiver trocando ou
              reparando um Agent. Para
              outra filial, cliente ou
              endereço físico, crie um
              novo local na mesma conta.
            </p>
          </div>

          {pairing.status !==
          "success" ? (
            <form
              action={formAction}
              className={
                styles.generator
              }
            >
              {pairing.status ===
              "error" ? (
                <div className="form-alert error">
                  {pairing.message}
                </div>
              ) : null}

              <div
                className={
                  styles.siteFields
                }
              >
                <label>
                  <span>Local</span>
                  <select
                    name="site_id"
                    value={
                      selectedSiteId
                    }
                    onChange={(event) =>
                      setSelectedSiteId(
                        event.target.value,
                      )
                    }
                    required
                  >
                    {sites.map(
                      (site) => (
                        <option
                          key={site.id}
                          value={site.id}
                        >
                          {site.name} ·{" "}
                          {site.cameraCount}{" "}
                          câmera(s)
                        </option>
                      ),
                    )}
                    <option value="__new__">
                      + Criar novo local
                    </option>
                  </select>
                </label>

                {!selectedExisting ? (
                  <>
                    <label>
                      <span>
                        Nome do novo
                        local
                      </span>
                      <input
                        name="new_site_name"
                        minLength={2}
                        maxLength={160}
                        placeholder="Ex.: Filial Centro"
                        required
                      />
                    </label>

                    <label>
                      <span>
                        Fuso horário
                      </span>
                      <select
                        name="new_site_timezone"
                        defaultValue="America/Sao_Paulo"
                      >
                        <option value="America/Sao_Paulo">
                          Brasília / São
                          Paulo
                        </option>
                        <option value="America/Manaus">
                          Manaus
                        </option>
                        <option value="America/Cuiaba">
                          Cuiabá
                        </option>
                        <option value="America/Rio_Branco">
                          Rio Branco
                        </option>
                        <option value="America/Noronha">
                          Fernando de
                          Noronha
                        </option>
                      </select>
                    </label>
                  </>
                ) : null}
              </div>

              <div
                className={
                  styles.siteExplanation
                }
              >
                <strong>
                  {selectedExisting
                    ? "Local existente"
                    : "Novo local"}
                </strong>
                <p>
                  {selectedExisting
                    ? "O novo pareamento substitui somente o computador ativo deste local. Agents de outros locais permanecem intactos."
                    : "O novo local fica dentro da mesma empresa e terá seu próprio Agent e suas próprias câmeras."}
                </p>
              </div>

              <button
                className="panel-primary-action"
                type="submit"
                disabled={
                  pairingPending
                }
              >
                {pairingPending
                  ? "Gerando..."
                  : "Gerar código de conexão"}
              </button>
            </form>
          ) : (
            <>
              <div
                className={
                  styles.pairingCodeBox
                }
              >
                <span>
                  {pairing.siteName ??
                    "LOCAL"}{" "}
                  · SEU CÓDIGO
                </span>
                <div
                  className={
                    styles.pairingCodeRow
                  }
                >
                  <strong>
                    {pairing.code}
                  </strong>
                  <button
                    type="button"
                    onClick={() =>
                      void copy(
                        pairing.code as string,
                      )
                    }
                  >
                    {copied
                      ? "Copiado"
                      : "Copiar"}
                  </button>
                </div>
                <p>
                  Digite na instalação
                  que está fisicamente
                  neste local. O código
                  vale 15 minutos.
                </p>
              </div>

              {!expired ? (
                <div
                  className={
                    styles.waitingBox
                  }
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className={
                      styles.spinner
                    }
                    aria-hidden="true"
                  />
                  <div>
                    <strong>
                      Esperando este
                      computador se
                      conectar
                    </strong>
                    <p>
                      Assim que o
                      heartbeat chegar,
                      o passo 2 abre
                      automaticamente.
                    </p>
                    {elapsed >= 90 ? (
                      <p
                        className={
                          styles.waitingSlow
                        }
                      >
                        Está demorando
                        mais que o
                        normal. Confirme
                        se a instalação
                        continua aberta e
                        com internet.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div
                  className={
                    styles.expiredBox
                  }
                >
                  <strong>
                    O código expirou
                  </strong>
                  <p>
                    Gere outro código
                    para o mesmo local.
                  </p>
                  <form
                    action={
                      formAction
                    }
                  >
                    <input
                      type="hidden"
                      name="site_id"
                      value={
                        pairing.siteId
                      }
                    />
                    <button
                      className="panel-primary-action"
                      type="submit"
                      disabled={
                        pairingPending
                      }
                    >
                      {pairingPending
                        ? "Gerando..."
                        : "Gerar novo código"}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      ) : null}

      {stage === 2 &&
      connectedAgentId ? (
        <section
          className={styles.stageCard}
        >
          <div
            className={
              styles.stageHeading
            }
          >
            <span>PASSO 2 DE 3</span>
            <h2>
              Procure as câmeras de{" "}
              {pairing.siteName ??
                "este local"}
            </h2>
            <p>
              A busca será enviada
              somente para o Agent que
              acabou de ser conectado
              neste local.
            </p>
          </div>

          <RepairDiscoveryPanel
            agentId={
              connectedAgentId
            }
            defaultCameraCount={Math.max(
              existingCameraCount,
              1,
            )}
            onCompleted={
              finishDiscovery
            }
          />
        </section>
      ) : null}

      {stage === 3 ? (
        <section
          className={`${styles.stageCard} ${styles.successCard}`}
        >
          <div
            className={
              styles.successIcon
            }
            aria-hidden="true"
          >
            ✓
          </div>
          <div>
            <span
              className={
                styles.successEyebrow
              }
            >
              CONEXÃO CONCLUÍDA
            </span>
            <h2>
              {pairing.siteName ??
                "Local"}{" "}
              conectado
            </h2>
            <p>
              {connectedCameras === 1
                ? "1 câmera foi associada."
                : `${connectedCameras} câmeras foram associadas.`}{" "}
              Os outros locais da
              empresa permanecem
              independentes.
            </p>
            <div
              className={
                styles.finishActions
              }
            >
              <Link
                href="/dashboard/cameras"
                className="panel-primary-action"
              >
                Conferir câmeras
              </Link>
              <Link
                href="/dashboard/installer"
                className="panel-secondary-action"
              >
                Voltar para
                Instalação
              </Link>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
