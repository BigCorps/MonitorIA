import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getDashboardData,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { eventTypeLabel } from "@/src/lib/event-labels";
import { DashboardSidebar } from "./dashboard-sidebar";

export const metadata = { title: "Visão geral" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function eventTime(
  value: string,
  timeZone: string,
) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

export default async function DashboardPage({
  searchParams,
}: Props) {
  const user = await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const sites = await getOrganizationSites(
    organization.id,
  );

  if (!sites.length) redirect("/onboarding");

  const site = sites[0];
  const data = await getDashboardData(
    organization,
    site,
  );
  const params = await searchParams;
  const message =
    typeof params.message === "string"
      ? params.message
      : null;

  const progress = [
    true,
    data.cameras > 0,
    data.agentsOnline > 0,
  ];
  const completed =
    progress.filter(Boolean).length;

  const metrics = [
    {
      label: "Câmeras",
      value: String(data.cameras),
      helper: data.cameras
        ? "Câmeras cadastradas"
        : "Aguardando configuração",
    },
    {
      label: "Agentes online",
      value: String(data.agentsOnline),
      helper: data.agentsOnline
        ? "Heartbeat ativo"
        : "Nenhum agente conectado",
    },
    {
      label: "Eventos hoje",
      value: String(data.eventsToday),
      helper: data.eventsToday
        ? "Eventos estruturados"
        : "A linha do tempo está vazia",
    },
    {
      label: "Uso estimado",
      value: formatCurrency(
        data.estimatedCostBrl,
      ),
      helper: "COGS visual no mês",
    },
  ];

  const steps = [
    {
      title: "Local cadastrado",
      text: `${site.name} · ${site.timezone}`,
    },
    {
      title: "Adicione a câmera",
      text:
        "Nomeie a câmera e configure o perfil de monitoramento.",
    },
    {
      title: "Instale o agente",
      text:
        "O Agent conecta ao RTSP e envia somente eventos relevantes.",
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
        className="dashboard-content"
        id="visao-geral"
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              VISÃO GERAL ·{" "}
              {site.name.toUpperCase()}
            </span>
            <h1>
              {greeting(site.timezone)}. O MonitorIA
              está conectado!
            </h1>
            <p>
              Dados reais da organização{" "}
              {organization.name}. Plano atual:{" "}
              {organization.planCode}.
            </p>
          </div>

          <Link href="/" className="back-link">
            Ver apresentação ↗
          </Link>
        </header>

        {message ? (
          <div className="dashboard-message">
            {message}
          </div>
        ) : null}

        <div className="metric-grid">
          {metrics.map((metric) => (
            <article
              className="metric-card"
              key={metric.label}
            >
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.helper}</small>
            </article>
          ))}
        </div>

        <div className="dashboard-grid">
          <section
            className="empty-panel"
            id="cameras"
          >
            <div className="panel-title-row">
              <div>
                <span>PRIMEIROS PASSOS</span>
                <h2>
                  Conecte a primeira câmera
                </h2>
              </div>
              <span className="status-chip">
                {completed} de 3
              </span>
            </div>

            <div className="steps-list">
              {steps.map((step, index) => (
                <article
                  className={
                    progress[index]
                      ? "completed"
                      : ""
                  }
                  key={step.title}
                >
                  <span>
                    {progress[index]
                      ? "✓"
                      : index + 1}
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                  </div>
                </article>
              ))}
            </div>

            <Link
              href="/dashboard/cameras/new"
              className="panel-primary-action"
            >
              Cadastrar primeira câmera
            </Link>
          </section>

          <section
            className="health-panel"
            id="agentes"
          >
            <div className="panel-title-row">
              <div>
                <span>INFRAESTRUTURA</span>
                <h2>Saúde do sistema</h2>
              </div>
              <span className="online-chip">
                <i /> Operacional
              </span>
            </div>

            <div className="health-list">
              <div>
                <span>Aplicação web</span>
                <strong>Online</strong>
              </div>
              <div>
                <span>Banco de dados</span>
                <strong
                  className={
                    data.databaseReady
                      ? ""
                      : "muted"
                  }
                >
                  {data.databaseReady
                    ? "Conectado"
                    : "Verificar"}
                </strong>
              </div>
              <div>
                <span>Frames temporários</span>
                <strong>
                  {
                    data.retention
                      .temporary_frame_days
                  }{" "}
                  dias
                </strong>
              </div>
              <div>
                <span>Metadados</span>
                <strong>
                  {
                    data.retention
                      .metadata_days
                  }{" "}
                  dias
                </strong>
              </div>
              <div>
                <span>Agente local</span>
                <strong
                  className={
                    data.agentsOnline
                      ? ""
                      : "muted"
                  }
                >
                  {data.agentsOnline
                    ? "Online"
                    : "Não instalado"}
                </strong>
              </div>
              <div>
                <span>Análise visual</span>
                <strong
                  className={
                    process.env.OPENAI_API_KEY
                      ? ""
                      : "muted"
                  }
                >
                  {process.env.OPENAI_API_KEY
                    ? "Configurada"
                    : "Não configurada"}
                </strong>
              </div>
            </div>

            <a
              href="/api/health/deep"
              target="_blank"
              rel="noreferrer"
            >
              Abrir diagnóstico autenticado →
            </a>
          </section>
        </div>

        <section
          className="events-panel"
          id="eventos"
        >
          <div className="events-panel-heading">
            <div>
              <span>LINHA DO TEMPO</span>
              <h2>Eventos recentes</h2>
            </div>
            <small>
              {data.recentEvents.length} resultado(s)
            </small>
          </div>

          {data.recentEvents.length ? (
            <div className="real-event-list">
              {data.recentEvents.map((event) => (
                <article key={event.id}>
                  <time>
                    {eventTime(
                      event.startedAt,
                      site.timezone,
                    )}
                  </time>
                  <div>
                    <strong>
                      {event.headline}
                    </strong>
                    <span>
                      {eventTypeLabel(event.type)}
                    </span>
                  </div>
                  <small>
                    {Math.round(
                      event.confidence * 100,
                    )}
                    %
                    {event.requiresReview
                      ? " · revisar"
                      : ""}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <div className="event-empty compact">
              <div className="event-empty-icon">
                ≋
              </div>
              <div>
                <h2>Nenhum evento recebido</h2>
                <p>
                  Quando o Agent estiver
                  conectado, os acontecimentos
                  aparecerão aqui em ordem
                  cronológica.
                </p>
              </div>
              <span>Timeline vazia</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
