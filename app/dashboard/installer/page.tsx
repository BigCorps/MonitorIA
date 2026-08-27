import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getInstallerWorkspace } from "@/src/lib/installer-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "./installer.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { SmartScreenNotice } from "@/src/components/installer/smartscreen-notice";

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
              Escolha como este computador deve manter o MonitorIA ativo.
              Windows 24/7, Microsoft Store e Linux usam o mesmo núcleo de
              monitoramento.
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
            <small>Mesmo núcleo · Windows e Linux</small>
          </article>
        </div>

        <div className={styles.layout}>
          <section className={styles.installCard}>
            <div className={styles.cardHeading}>
              <div>
                <span>INSTALAÇÃO NO WINDOWS</span>
                <h2>Escolha a opção ideal para este computador</h2>
              </div>
              <span className={styles.windowsBadge}>Windows 10/11 · 64 bits</span>
            </div>

            <div className={styles.windowsChoices}>
              <article className={styles.choiceCard}>
                <div className={styles.choiceHeader}>
                  <div>
                    <span className={styles.recommendedBadge}>RECOMENDADO 24/7</span>
                    <h3>MonitorIA 24/7</h3>
                  </div>
                  <span className={styles.choiceTag}>Direto do MonitorIA</span>
                </div>

                <p>
                  Melhor para um computador dedicado às câmeras. O monitoramento
                  inicia junto com o Windows, inclusive antes de alguém entrar
                  na conta.
                </p>

                <ul>
                  <li>Continua ativo sem usuário conectado.</li>
                  <li>Ícone do MonitorIA aparece após o login.</li>
                  <li>Atualizações chegam pelo canal oficial do MonitorIA.</li>
                </ul>

                {windows?.available ? (
                  <a
                    href="/api/installer/windows"
                    className={styles.downloadButton}
                  >
                    Baixar MonitorIA 24/7
                  </a>
                ) : (
                  <div className={styles.pendingDownload}>
                    <strong>Instalador 24/7 ainda não publicado</strong>
                    <p>A versão final aparecerá aqui quando a release for liberada.</p>
                  </div>
                )}

                <div className={styles.directNotice}>
                  <SmartScreenNotice variant="compact" />
                </div>

                <p className={styles.securityFootnote}>
                  Baixe esta edição somente pelo site ou painel oficial do
                  MonitorIA. O Windows ou seu antivírus pode analisar o arquivo;
                  não é necessário desativar a proteção do computador.
                </p>
              </article>

              <article className={styles.choiceCard}>
                <div className={styles.choiceHeader}>
                  <div>
                    <span className={styles.storeBadge}>MICROSOFT STORE</span>
                    <h3>MonitorIA via Microsoft Store</h3>
                  </div>
                  <span className={styles.choiceTag}>Após login</span>
                </div>

                <p>
                  Instalação mais simples para computadores de uso normal. O
                  MonitorIA começa depois que o usuário entra no Windows e
                  continua ativo enquanto essa sessão permanecer aberta.
                </p>

                <ul>
                  <li>Instalação do MonitorIA sem privilégio administrativo.</li>
                  <li>Ícone de status na bandeja do Windows.</li>
                  <li>Atualizações seguem o canal da Microsoft Store.</li>
                </ul>

                {workspace.storeDistribution.available &&
                workspace.storeDistribution.url ? (
                  <a
                    href={workspace.storeDistribution.url}
                    className={styles.storeButton}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir na Microsoft Store
                  </a>
                ) : (
                  <div className={styles.storePending}>
                    <strong>Em preparação para a Microsoft Store</strong>
                    <p>
                      Este botão será liberado somente depois da aprovação da
                      versão 1.0.3 pela Microsoft.
                    </p>
                  </div>
                )}

                <p className={styles.securityFootnote}>
                  A distribuição pela Store reduz etapas e alertas de reputação,
                  mas o Windows e programas de segurança ainda podem analisar o
                  aplicativo normalmente.
                </p>
              </article>
            </div>

            <div className={styles.comparison}>
              <h3>Qual versão escolher?</h3>
              <div className={styles.comparisonScroller}>
                <table>
                  <thead>
                    <tr>
                      <th>Diferença</th>
                      <th>MonitorIA 24/7</th>
                      <th>Microsoft Store</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Onde instala</td>
                      <td>Painel oficial do MonitorIA</td>
                      <td>Microsoft Store</td>
                    </tr>
                    <tr>
                      <td>Depois de reiniciar</td>
                      <td>Monitora antes do login</td>
                      <td>Começa após o login</td>
                    </tr>
                    <tr>
                      <td>Tela bloqueada</td>
                      <td>Continua monitorando</td>
                      <td>Continua monitorando</td>
                    </tr>
                    <tr>
                      <td>Sem usuário conectado</td>
                      <td>Continua monitorando</td>
                      <td>Aguarda o próximo login</td>
                    </tr>
                    <tr>
                      <td>Ícone na bandeja</td>
                      <td>Sim, após login</td>
                      <td>Sim</td>
                    </tr>
                    <tr>
                      <td>Atualizações</td>
                      <td>Canal oficial do MonitorIA</td>
                      <td>Microsoft Store</td>
                    </tr>
                    <tr>
                      <td>Melhor para</td>
                      <td>PC dedicado e monitoramento contínuo</td>
                      <td>PC de uso diário que permanece logado</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.commonSteps}>
              <span>DEPOIS DE INSTALAR NO WINDOWS</span>
              <h3>O pareamento é igual nas duas opções</h3>
            </div>

            <ol className={styles.steps}>
              <li>
                <span>1</span>
                <div>
                  <strong>Gere o código somente quando o MonitorIA pedir</strong>
                  <p>
                    Em Câmeras, abra a câmera e gere o código de conexão. Ele
                    vale 15 minutos e só pode ser usado uma vez.
                  </p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>Informe o código de conexão</strong>
                  <p>
                    Em uma instalação nova o código é obrigatório. Em uma
                    atualização saudável o pareamento existente é preservado e
                    o código não é pedido novamente.
                  </p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>Volte ao painel e clique em “Procurar câmeras”</strong>
                  <p>
                    Informe o usuário e a senha das câmeras no painel e
                    acompanhe a busca na tela.
                  </p>
                </div>
              </li>
            </ol>

            <div className={styles.platformDivider}>
              <span>OU INSTALE EM LINUX</span>
            </div>

            <p className={styles.platformIntro}>
              Linux usa o mesmo núcleo de monitoramento da versão 1.0.3 e é uma
              ótima opção para mini PCs dedicados. O processo inicia com o
              sistema e não depende de login gráfico. A instalação exige
              conhecimento técnico.
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
                  Escolha uma das opções de instalação e siga os passos para
                  conectar o primeiro computador.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
