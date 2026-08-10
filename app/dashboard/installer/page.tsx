import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getInstallerWorkspace } from "@/src/lib/installer-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "./installer.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Instalação" };
export const dynamic = "force-dynamic";

function formatDate(value: string | null, timeZone: string) {
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
  const agentsByStatus = [...workspace.agents].sort((first, second) => {
    if (first.status === second.status) {
      return first.name.localeCompare(second.name, "pt-BR");
    }
    return first.status === "online" ? -1 : 1;
  });

  const windows = workspace.downloads.find(
    (download) => download.platform === "windows",
  );
  const linuxDownloads = workspace.downloads.filter((download) =>
    download.platform.startsWith("linux"),
  );

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
              INSTALAÇÃO · {organization.name.toUpperCase()}
            </span>
            <h1>Conecte as câmeras ao MonitorIA</h1>
            <p>
              Baixe o aplicativo MonitorIA para Windows ou Linux, veja a versão
              instalada e confira se o computador das câmeras está funcionando.
            </p>
          </div>

          <Link href="/dashboard/cameras" className="panel-secondary-action">
            Abrir câmeras
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <div className={styles.metrics}>
          <article>
            <span>Computadores online</span>
            <strong>{onlineAgents}</strong>
            <small>{workspace.agents.length} computador(es) instalado(s)</small>
          </article>
          <article>
            <span>Câmeras conectadas</span>
            <strong>
              {workspace.pairedCameras}/{workspace.totalCameras}
            </strong>
            <small>Câmeras ligadas ao computador</small>
          </article>
          <article>
            <span>Versão recomendada</span>
            <strong>v{workspace.recommendedVersion}</strong>
            <small>Windows e Linux · 64 bits</small>
          </article>
        </div>

        <div className={styles.layout}>
          <section className={styles.installCard}>
            <div className={styles.cardHeading}>
              <div>
                <span>INSTALAÇÃO NO WINDOWS</span>
                <h2>Instale no computador que acessa as câmeras</h2>
              </div>
              <span className={styles.windowsBadge}>Windows · Linux</span>
            </div>

            <ol className={styles.steps}>
              <li>
                <span>1</span>
                <div>
                  <strong>Baixe e abra o instalador</strong>
                  <p>
                    Dê dois cliques no arquivo e confirme a solicitação de
                    administrador do Windows.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Quando solicitado, gere o código da câmera</strong>
                  <p>
                    Em Câmeras, abra a câmera e gere o código de pareamento.
                    Ele vale 15 minutos, por isso gere somente nesta etapa.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Informe o código, o usuário e a senha</strong>
                  <p>
                    O MonitorIA procura automaticamente todas as câmeras que
                    aceitam esses dados. A senha fica somente no computador.
                  </p>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>Pronto</strong>
                  <p>
                    O instalador valida o vídeo, conecta a câmera e configura
                    o MonitorIA para iniciar automaticamente com o Windows.
                  </p>
                </div>
              </li>
            </ol>

            {windows?.available ? (
              <a
                href="/api/installer/windows"
                className={styles.downloadButton}
              >
                Baixar instalador para Windows
              </a>
            ) : (
              <div className={styles.pendingDownload}>
                <strong>Instalador do Windows ainda não publicado</strong>
                <p>
                  Durante os testes, continue usando a versão fornecida pela
                  equipe. A versão final aparecerá neste botão.
                </p>
              </div>
            )}

            <div className={styles.platformDivider}>
              <span>OU INSTALE EM LINUX</span>
            </div>

            <p className={styles.platformIntro}>
              Um mini PC dedicado costuma ser mais estável que o computador da
              loja: não é desligado por engano e não reinicia sozinho para
              atualizar. A instalação em Linux exige conhecimento técnico.
            </p>

            <ol className={styles.steps}>
              <li>
                <span>1</span>
                <div>
                  <strong>Baixe e extraia o pacote</strong>
                  <code>tar xzf monitoria-agent-linux-x64.tar.gz</code>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Execute o instalador</strong>
                  <code>
                    cd monitoria-agent-linux-x64 &amp;&amp; sudo ./install.sh
                  </code>
                  <p>
                    Ele configura o MonitorIA para iniciar automaticamente e
                    pede o código de conexão no fim.
                  </p>
                </div>
              </li>
            </ol>

            <div className={styles.downloadRow}>
              {linuxDownloads.map((download) =>
                download.available ? (
                  <a
                    key={download.platform}
                    href={`/api/installer/${download.platform}`}
                    className={styles.secondaryDownload}
                  >
                    {download.label}
                  </a>
                ) : (
                  <span
                    key={download.platform}
                    className={styles.secondaryDisabled}
                  >
                    {download.label} · em breve
                  </span>
                ),
              )}
            </div>
          </section>

          <section className={styles.agentList}>
            <div className={styles.cardHeading}>
              <div>
                <span>COMPUTADORES CONECTADOS</span>
                <h2>Computadores do MonitorIA</h2>
              </div>
            </div>

            {workspace.agents.length ? (
              <div className={styles.agents}>
                {agentsByStatus.map((agent) => (
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
                                agent.version === workspace.recommendedVersion
                                  ? styles.currentVersion
                                  : styles.outdatedVersion
                              }
                            >
                              {agent.version === workspace.recommendedVersion
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
                        <dt>Última comunicação</dt>
                        <dd>
                          {formatDate(
                            agent.lastHeartbeatAt,
                            agent.siteTimezone,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Uso do processador</dt>
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
                        <dt>Espaço livre</dt>
                        <dd>{bytes(agent.diskFreeBytes)}</dd>
                      </div>
                      <div>
                        <dt>Aguardando envio</dt>
                        <dd>{agent.queuedEvents} evento(s)</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Nenhum computador conectado</strong>
                <p>
                  Baixe o instalador e siga os passos para conectar a primeira
                  câmera.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
