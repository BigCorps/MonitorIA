import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getInstallerWorkspace } from "@/src/lib/installer-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "./installer.module.css";

export const metadata = { title: "Instalador" };
export const dynamic = "force-dynamic";

function formatDate(
  value: string | null,
  timeZone: string,
) {
  if (!value) return "Nunca conectado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function bytes(value: number | null) {
  if (value === null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export default async function InstallerPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const workspace = await getInstallerWorkspace(organization.id);
  const onlineAgents = workspace.agents.filter(
    (agent) => agent.status === "online",
  ).length;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="installer"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INSTALADOR · {organization.name.toUpperCase()}
            </span>
            <h1>Conecte as câmeras ao MonitorIA</h1>
            <p>
              Baixe o Agent Windows, acompanhe a versão instalada e
              confira a saúde do computador que acessa as câmeras.
            </p>
          </div>

          <Link
            href="/dashboard/cameras"
            className="panel-secondary-action"
          >
            Abrir câmeras
          </Link>
        </header>

        <div className={styles.metrics}>
          <article>
            <span>Agents online</span>
            <strong>{onlineAgents}</strong>
            <small>{workspace.agents.length} instalado(s)</small>
          </article>
          <article>
            <span>Câmeras pareadas</span>
            <strong>
              {workspace.pairedCameras}/{workspace.totalCameras}
            </strong>
            <small>Fontes vinculadas ao Agent</small>
          </article>
          <article>
            <span>Versão recomendada</span>
            <strong>v{workspace.recommendedVersion}</strong>
            <small>Agent Windows 64 bits</small>
          </article>
        </div>

        <div className={styles.layout}>
          <section className={styles.installCard}>
            <div className={styles.cardHeading}>
              <div>
                <span>INSTALAÇÃO NO WINDOWS</span>
                <h2>Instale no computador da câmera</h2>
              </div>
              <span className={styles.windowsBadge}>Windows x64</span>
            </div>

            <ol className={styles.steps}>
              <li>
                <span>1</span>
                <div>
                  <strong>Baixe o instalador</strong>
                  <p>
                    Use um computador que permaneça ligado e tenha
                    acesso à mesma rede das câmeras RTSP. Prefira
                    conexão por cabo: RTSP sobre Wi-Fi instável derruba
                    o vídeo e gera alarme falso de câmera offline.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Execute como administrador</strong>
                  <p>
                    O Windows pode exibir um aviso de proteção antes de
                    abrir. Clique em &ldquo;Mais informações&rdquo; e
                    depois em &ldquo;Executar assim mesmo&rdquo; — o
                    instalador é publicado pela BigCorps.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Gere o código quando o instalador pedir</strong>
                  <p>
                    Só então abra a câmera no painel e gere o código de
                    pareamento: ele expira em 15 minutos. Gerar antes de
                    baixar costuma estourar o prazo.
                  </p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>Pronto</strong>
                  <p>
                    O MonitorIA passa a rodar como serviço do Windows e
                    sobe sozinho ao ligar o computador. O endereço e a
                    senha RTSP ficam protegidos localmente pelo DPAPI e
                    nunca saem da máquina.
                  </p>
                </div>
              </li>
            </ol>

            {workspace.downloadAvailable ? (
              <a
                href="/api/installer/windows"
                className={styles.downloadButton}
              >
                Baixar Agent para Windows
              </a>
            ) : (
              <div className={styles.pendingDownload}>
                <strong>Download comercial ainda não publicado</strong>
                <p>
                  Durante a validação, continue usando o artifact do
                  GitHub Actions. A versão final aparecerá neste botão.
                </p>
              </div>
            )}
          </section>

          <section className={styles.agentList}>
            <div className={styles.cardHeading}>
              <div>
                <span>COMPUTADORES CONECTADOS</span>
                <h2>Status dos Agents</h2>
              </div>
            </div>

            {workspace.agents.length ? (
              <div className={styles.agents}>
                {workspace.agents.map((agent) => (
                  <article key={agent.id}>
                    <header>
                      <div>
                        <i data-online={agent.status === "online"} />
                        <div>
                          <strong>{agent.name}</strong>
                          <span>{agent.siteName}</span>
                        </div>
                      </div>
                      <span
                        className={
                          agent.status === "online"
                            ? styles.online
                            : styles.offline
                        }
                      >
                        {agent.status === "online" ? "Online" : "Offline"}
                      </span>
                    </header>

                    <dl>
                      <div>
                        <dt>Versão</dt>
                        <dd>
                          {agent.version ?? "—"}
                          {agent.version ? (
                            <small
                              className={
                                agent.version ===
                                workspace.recommendedVersion
                                  ? styles.currentVersion
                                  : styles.outdatedVersion
                              }
                            >
                              {agent.version ===
                              workspace.recommendedVersion
                                ? "Atualizado"
                                : "Atualização disponível"}
                            </small>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt>Sistema</dt>
                        <dd>
                          {[agent.platform, agent.architecture]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>Último heartbeat</dt>
                        <dd>{formatDate(agent.lastHeartbeatAt, agent.siteTimezone)}</dd>
                      </div>
                      <div>
                        <dt>CPU</dt>
                        <dd>
                          {agent.cpuPercent === null
                            ? "—"
                            : `${agent.cpuPercent.toFixed(1)}%`}
                        </dd>
                      </div>
                      <div>
                        <dt>Memória</dt>
                        <dd>{bytes(agent.memoryBytes)}</dd>
                      </div>
                      <div>
                        <dt>Disco livre</dt>
                        <dd>{bytes(agent.diskFreeBytes)}</dd>
                      </div>
                      <div>
                        <dt>Fila</dt>
                        <dd>{agent.queuedEvents} evento(s)</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Nenhum Agent instalado</strong>
                <p>
                  Baixe o instalador e siga os passos para conectar a
                  primeira câmera.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}