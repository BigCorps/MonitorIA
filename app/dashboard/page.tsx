import Link from "next/link";
import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
} from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getDashboardData,
  getOrganizationSetupCameras,
  getOrganizationSites,
  getSiteAgentStatus,
} from "@/src/lib/dashboard-data";
import {
  readOnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  eventTypeLabel,
} from "@/src/lib/event-labels";
import { DashboardSidebar } from "./dashboard-sidebar";
import styles from "./overview.module.css";
import { getOrganizationSourceContext } from "@/src/lib/source-context";
import { FirstRunSetup } from "./first-run-setup";
import {
  getFirstRunStatusAction,
} from "./first-run-status";

export const metadata = {
  title: "Visão geral",
};
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<
    Record<
      string,
      string | string[] | undefined
    >
  >;
};

const planLabels: Record<string, string> = {
  basic: "Essencial",
  standard: "Atenta",
  intensive: "Detalhada",
};

function greeting(timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );

  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function eventTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function DashboardPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const sites = await getOrganizationSites(organization.id);
  if (!sites.length) redirect("/onboarding");

  const site = sites[0];
  const [data, cameras, agent, sourceContext] = await Promise.all([
    getDashboardData(organization, site),
    getOrganizationSetupCameras(organization.id),
    getSiteAgentStatus(organization.id),
    getOrganizationSourceContext(organization.id),
  ]);

  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const showEventsAction = Boolean(
    message && /(teste|demonstração).*(iniciad|andamento)/i.test(message),
  );

  const firstRun = await getFirstRunStatusAction();

  if (firstRun.stage < 5) {
    const intake = readOnboardingIntake(user.user_metadata);

    return (
      <FirstRunSetup
        organizationName={organization.name}
        userEmail={user.email ?? null}
        site={site}
        cameras={cameras}
        agentPaired={agent.paired}
        defaultCameraCount={intake.cameraCount}
        stage={firstRun.stage}
        message={message}
      />
    );
  }

  const recordingOnly =
    sourceContext.mode === "recordings_only";
  const hybrid = sourceContext.mode === "hybrid";

  const progress = recordingOnly
    ? [
        true,
        sourceContext.recordingEnvironmentCount > 0,
      ]
    : hybrid
      ? [
          true,
          sourceContext.liveCameraCount > 0,
          sourceContext.recordingEnvironmentCount > 0,
          sourceContext.agentCount > 0,
        ]
      : [
          true,
          sourceContext.liveCameraCount > 0,
          sourceContext.agentCount > 0,
        ];

  const completed = progress.filter(Boolean).length;
  const setupComplete = completed === progress.length;

  const metrics = [
    ...(recordingOnly
      ? [
          {
            label: "Ambientes",
            value: String(
              sourceContext.recordingEnvironmentCount,
            ),
            helper: "para envio de arquivos",
          },
          {
            label: "Modo de uso",
            value: "Gravações",
            helper: "arquivos avulsos, sem câmera online",
          },
        ]
      : [
          {
            label: "Câmeras conectadas",
            value: String(sourceContext.liveCameraCount),
            helper: sourceContext.liveCameraCount
              ? "monitoramento contínuo"
              : "aguardando configuração",
          },
          {
            label: "Computadores online",
            value: String(sourceContext.agentOnlineCount),
            helper: sourceContext.agentOnlineCount
              ? "monitoramento contínuo ativo"
              : "nenhum computador online",
          },
        ]),
    ...(hybrid
      ? [
          {
            label: "Ambientes de gravação",
            value: String(
              sourceContext.recordingEnvironmentCount,
            ),
            helper: "arquivos enviados separadamente",
          },
        ]
      : []),
    {
      label: "Hoje",
      value: String(data.eventsToday),
      helper: data.eventsToday
        ? "acontecimentos registrados"
        : "nenhum acontecimento",
    },
    {
      label: "Plano atual",
      value:
        planLabels[organization.planCode] ??
        organization.planCode,
      helper: "configuração da organização",
    },
  ];

  const steps = recordingOnly
    ? [
        {
          title: "Local cadastrado",
          text: `${site.name} · ${site.timezone}`,
        },
        {
          title: "Ambientes de gravação",
          text: `${sourceContext.recordingEnvironmentCount} ambiente(s) para arquivos avulsos.`,
        },
      ]
    : hybrid
      ? [
          {
            title: "Local cadastrado",
            text: `${site.name} · ${site.timezone}`,
          },
          {
            title: "Câmeras conectadas",
            text: `${sourceContext.liveCameraCount} fonte(s) de monitoramento contínuo.`,
          },
          {
            title: "Ambientes de gravação",
            text: `${sourceContext.recordingEnvironmentCount} ambiente(s) para arquivos avulsos.`,
          },
          {
            title: "Computador configurado",
            text: "Monitoramento contínuo disponível para as câmeras conectadas.",
          },
        ]
      : [
          {
            title: "Local cadastrado",
            text: `${site.name} · ${site.timezone}`,
          },
          {
            title: "Câmera cadastrada",
            text: "Nome, local e perfil de monitoramento definidos.",
          },
          {
            title: "Computador conectado",
            text: "Monitoramento e envio de acontecimentos funcionando.",
          },
        ];

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="overview"
      />

      <section
        className={`dashboard-content ${styles.content}`}
        id="visao-geral"
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              VISÃO GERAL · {site.name.toUpperCase()}
            </span>
            <h1>
              {greeting(site.timezone)}.{" "}
              {recordingOnly
                ? "Veja o que suas gravações já mostraram."
                : hybrid
                  ? "Veja câmeras conectadas e gravações em um só lugar."
                  : "Veja o que importa agora."}
            </h1>
            <p>
              {recordingOnly
                ? `Analise arquivos avulsos da organização ${organization.name} sem precisar manter uma câmera conectada.`
                : hybrid
                  ? `Acompanhe o monitoramento contínuo e consulte também os arquivos enviados pela organização ${organization.name}.`
                  : `Monitoramento visual da organização ${organization.name}, sem misturar configurações técnicas com a rotina diária.`}
            </p>
          </div>

          <Link
            href={recordingOnly ? "/dashboard/recordings" : "/dashboard/events"}
            className="back-link"
          >
            {recordingOnly
              ? "Analisar gravação →"
              : "Abrir monitoramento →"}
          </Link>
        </header>

        {message ? (
          <div
            className="dashboard-message"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "14px",
              flexWrap: "wrap",
            }}
          >
            <span>{message}</span>
            {showEventsAction ? (
              <Link href="/dashboard/events" className="back-link">
                Ver acontecimentos →
              </Link>
            ) : null}
          </div>
        ) : null}

        <section className={styles.aiCard}>
          <div className={styles.aiCopy}>
            <span>PESQUISE DO SEU JEITO</span>
            <h2>
              Use a Pesquisa IA do MonitorIA ou conecte a IA que sua equipe já utiliza.
            </h2>
            <p>
              Pergunte o que aconteceu, compare períodos, encontre evidências e
              consulte a operação pelo MonitorIA, ChatGPT, Claude ou Cursor.
            </p>

            <div className={styles.integrationChips}>
              <span>MonitorIA</span>
              <span>ChatGPT</span>
              <span>Claude</span>
              <span>Cursor</span>
              <span>MCP</span>
            </div>
          </div>

          <div className={styles.aiActions}>
            <Link href="/dashboard/search" className={styles.primaryAction}>
              Abrir Pesquisa IA
            </Link>
            <Link
              href="/dashboard/profile/mcp-connections"
              className={styles.secondaryAction}
            >
              Conectar minha própria IA
            </Link>
          </div>
        </section>

        <div className={styles.metrics}>
          {metrics.map((metric) => (
            <article key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.helper}</small>
            </article>
          ))}
        </div>

        <div className={styles.mainGrid}>
          <section className={styles.timelineCard}>
            <div className={styles.sectionHeading}>
              <div>
                <span>ACONTECIMENTOS RECENTES</span>
                <h2>O que aconteceu</h2>
              </div>
              <Link href="/dashboard/events">Ver linha do tempo →</Link>
            </div>

            {data.recentEvents.length ? (
              <div className={styles.eventList}>
                {data.recentEvents.slice(0, 6).map((event) => (
                  <article key={event.id}>
                    <time>{eventTime(event.startedAt, site.timezone)}</time>
                    <div>
                      <strong>{event.headline}</strong>
                      <span>{eventTypeLabel(event.type)}</span>
                    </div>
                    <small>
                      {Math.round(event.confidence * 100)}%
                      {event.requiresReview ? " · revisar" : ""}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <strong>Nenhum acontecimento hoje</strong>
                <p>
                  Os registros aparecerão aqui quando o MonitorIA detectar algo relevante.
                </p>
              </div>
            )}
          </section>

          <section className={styles.statusCard}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  {recordingOnly
                    ? "GRAVAÇÕES"
                    : hybrid
                      ? "CÂMERAS E GRAVAÇÕES"
                      : "CÂMERAS E INSTALAÇÃO"}
                </span>
                <h2>
                  {setupComplete
                    ? recordingOnly
                      ? "Pronto para analisar arquivos"
                      : "Tudo conectado"
                    : "Conclua a configuração"}
                </h2>
              </div>
              <span
                className={
                  setupComplete
                    ? styles.okBadge
                    : styles.pendingBadge
                }
              >
                {completed} de {progress.length}
              </span>
            </div>

            <div className={styles.steps}>
              {steps.map((step, index) => (
                <article key={step.title} data-complete={progress[index]}>
                  <span>{progress[index] ? "✓" : index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <div className={styles.cardActions}>
              {recordingOnly ? (
                <>
                  <Link href="/dashboard/recordings">
                    Abrir gravações
                  </Link>
                  <Link href="/dashboard/cameras">
                    Conectar câmeras
                  </Link>
                  <Link href="/dashboard/cameras/connections">
                    Como conectar
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/dashboard/cameras">
                    Gerenciar câmeras
                  </Link>
                  <Link href="/dashboard/recordings">
                    Gravações avulsas
                  </Link>
                  <Link href="/dashboard/installer">
                    Instalação
                  </Link>
                </>
              )}
            </div>
          </section>
        </div>

        <section className={styles.healthStrip}>
          <div>
            <span
              className={
                data.databaseReady
                  ? styles.healthDot
                  : styles.healthDotWarning
              }
            />
            <div>
              <strong>
                {data.databaseReady
                  ? "Sistema funcionando"
                  : "Verificação necessária"}
              </strong>
              <p>
                {recordingOnly
                  ? `Histórico disponível · ${sourceContext.recordingEnvironmentCount} ambiente(s) de gravação · dados guardados por ${data.retention.metadata_days} dias`
                  : `Banco ${data.databaseReady ? "conectado" : "indisponível"} · ${sourceContext.agentOnlineCount} computador(es) online · dados guardados por ${data.retention.metadata_days} dias`}
              </p>
            </div>
          </div>

          <Link
            href={
              recordingOnly
                ? "/dashboard/recordings"
                : "/dashboard/camera-health"
            }
          >
            {recordingOnly
              ? "Analisar outra gravação →"
              : "Ver funcionamento das câmeras →"}
          </Link>
        </section>
      </section>
    </main>
  );
}
