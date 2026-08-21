import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getOperationalAlertOverview } from "@/src/lib/operations-data";
import {
  operationalAlertContext,
  operationalAlertPresentation,
} from "@/src/lib/operations-display";
import {
  formatMonitoringDateTime,
  monitoringStateLabel,
} from "@/src/lib/monitoring-display";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../monitoring-analysis-details";
import {
  acknowledgeOperationalAlertAction,
  resolveOperationalAlertAction,
} from "./actions";
import { AlertsRealtimeRefresh } from "./alerts-realtime-refresh";
import styles from "./alerts.module.css";

export const metadata = { title: "Alertas | MonitorIA" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ViewFilter = "active" | "resolved" | "all";
type PriorityFilter = "all" | "critical" | "warning" | "info";

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function viewFilter(value: string): ViewFilter {
  return value === "resolved" || value === "all" ? value : "active";
}

function priorityFilter(value: string): PriorityFilter {
  return ["critical", "warning", "info"].includes(value)
    ? (value as PriorityFilter)
    : "all";
}

function priorityClass(severity: string) {
  if (severity === "critical") return styles.critical;
  if (severity === "warning") return styles.warning;
  return styles.info;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const params = await searchParams;
  const selectedView = viewFilter(param(params.view));
  const selectedPriority = priorityFilter(param(params.priority));

  const overview = await getOperationalAlertOverview(organization.id);
  const canManage = ["owner", "admin"].includes(organization.role);

  const filterPriority = <T extends { severity: string }>(alerts: T[]) =>
    selectedPriority === "all"
      ? alerts
      : alerts.filter((alert) => alert.severity === selectedPriority);

  const activeAlerts = filterPriority(overview.active);
  const resolvedAlerts = filterPriority(overview.recentResolved);
  const showActive = selectedView !== "resolved";
  const showResolved = selectedView !== "active";

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="operations"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              ALERTAS · {organization.name.toUpperCase()}
            </span>
            <h1>Alertas</h1>
            <p>
              Uma caixa única para situações que podem precisar da sua atenção,
              desde conexão de câmeras até desvios de rotina e processos.
            </p>
          </div>
          <AlertsRealtimeRefresh organizationId={organization.id} />
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.introCard}>
          <div>
            <strong>O que aparece aqui?</strong>
            <p>
              Funcionamento continua mostrando a saúde de cada câmera. Alertas
              reúne somente situações que podem pedir alguma ação. Ao começar a
              tratar uma delas, marque “Estou verificando”; quando a situação
              estiver resolvida, marque “Resolvido”.
            </p>
          </div>
          <span>Caixa de entrada da operação</span>
        </section>

        <section className={styles.summaryGrid} aria-label="Resumo dos alertas">
          <article>
            <strong>{overview.counts.total}</strong>
            <span>Precisam de atenção</span>
          </article>
          <article>
            <strong>{overview.counts.critical}</strong>
            <span>Urgentes</span>
          </article>
          <article>
            <strong>{overview.counts.warning}</strong>
            <span>Atenção</span>
          </article>
          <article>
            <strong>{overview.counts.acknowledged}</strong>
            <span>Estou verificando</span>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtrar alertas</summary>
          <form>
            <label>
              Mostrar
              <select name="view" defaultValue={selectedView}>
                <option value="active">Precisam de atenção</option>
                <option value="resolved">Resolvidos recentemente</option>
                <option value="all">Todos</option>
              </select>
            </label>
            <label>
              Prioridade
              <select name="priority" defaultValue={selectedPriority}>
                <option value="all">Todas</option>
                <option value="critical">Urgentes</option>
                <option value="warning">Atenção</option>
                <option value="info">Informativos</option>
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href="/dashboard/operations">Limpar</Link>
            </div>
          </form>
        </details>

        {showActive ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <span>PRECISA DE AÇÃO</span>
                <h2>O que merece sua atenção</h2>
              </div>
              <small>{activeAlerts.length} alertas no filtro atual</small>
            </div>

            {activeAlerts.length ? (
              <div className={styles.cards}>
                {activeAlerts.map((alert) => {
                  const presentation = operationalAlertPresentation(alert);
                  const context = operationalAlertContext(alert);

                  return (
                    <article
                      className={`${styles.card} ${
                        alert.status === "acknowledged"
                          ? styles.acknowledged
                          : ""
                      }`}
                      key={`${alert.source}-${alert.id}`}
                    >
                      <header className={styles.cardHeader}>
                        <div>
                          <span className={styles.eyebrow}>
                            {presentation.categoryLabel} · {context}
                          </span>
                          <h3>{presentation.title}</h3>
                        </div>
                        <span
                          className={`${styles.badge} ${priorityClass(
                            alert.severity,
                          )}`}
                        >
                          {presentation.priorityLabel}
                        </span>
                      </header>

                      {alert.status === "acknowledged" ? (
                        <div className={styles.inProgress}>
                          <span aria-hidden="true">✓</span>
                          <strong>{presentation.statusLabel}</strong>
                        </div>
                      ) : null}

                      <p className={styles.detected}>
                        Detectado em{" "}
                        {formatMonitoringDateTime(
                          alert.firstObservedAt,
                          alert.siteTimezone,
                        )}
                      </p>

                      <p className={styles.summary}>{presentation.summary}</p>

                      <div className={styles.recommendation}>
                        <strong>Recomendação</strong>
                        <p>{presentation.recommendation}</p>
                      </div>

                      <div className={styles.cardActions}>
                        {canManage && alert.status === "open" ? (
                          <form action={acknowledgeOperationalAlertAction}>
                            <input
                              type="hidden"
                              name="alert_id"
                              value={alert.id}
                            />
                            <input
                              type="hidden"
                              name="source"
                              value={alert.source}
                            />
                            <button className={styles.secondaryAction} type="submit">
                              Estou verificando
                            </button>
                          </form>
                        ) : null}

                        {canManage ? (
                          <form action={resolveOperationalAlertAction}>
                            <input
                              type="hidden"
                              name="alert_id"
                              value={alert.id}
                            />
                            <input
                              type="hidden"
                              name="source"
                              value={alert.source}
                            />
                            <button className={styles.primaryAction} type="submit">
                              Resolvido
                            </button>
                          </form>
                        ) : null}

                        <Link
                          className={styles.recordLink}
                          href={presentation.recordHref}
                        >
                          {presentation.recordLabel}
                        </Link>
                      </div>

                      <MonitoringAnalysisDetails
                        title="Detalhes do alerta"
                        description="Informações adicionais para quem quiser entender melhor esta detecção."
                        className={styles.analysisDetails}
                      >
                        <dl className={styles.detailGrid}>
                          <div>
                            <dt>Primeira detecção</dt>
                            <dd>
                              {formatMonitoringDateTime(
                                alert.firstObservedAt,
                                alert.siteTimezone,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Última atualização</dt>
                            <dd>
                              {formatMonitoringDateTime(
                                alert.lastObservedAt,
                                alert.siteTimezone,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>Estado</dt>
                            <dd>{presentation.statusLabel}</dd>
                          </div>
                          {presentation.confidenceLabel ? (
                            <div>
                              <dt>Certeza da análise</dt>
                              <dd>{presentation.confidenceLabel}</dd>
                            </div>
                          ) : null}
                        </dl>
                        {presentation.detailReason ? (
                          <p className={styles.detailReason}>
                            {presentation.detailReason}
                          </p>
                        ) : null}
                      </MonitoringAnalysisDetails>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <h3>Nenhum alerta neste filtro</h3>
                <p>
                  Quando uma situação exigir atenção, ela aparecerá aqui com a
                  recomendação e o registro relacionado.
                </p>
              </div>
            )}
          </section>
        ) : null}

        {showResolved ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <span>HISTÓRICO RECENTE</span>
                <h2>Resolvidos recentemente</h2>
              </div>
              <small>{resolvedAlerts.length} alertas no filtro atual</small>
            </div>

            {resolvedAlerts.length ? (
              <div className={styles.resolvedList}>
                {resolvedAlerts.map((alert) => {
                  const presentation = operationalAlertPresentation(alert);
                  return (
                    <article
                      className={styles.resolvedCard}
                      key={`${alert.source}-${alert.id}`}
                    >
                      <div>
                        <span className={styles.resolvedContext}>
                          {presentation.categoryLabel} ·{" "}
                          {operationalAlertContext(alert)}
                        </span>
                        <h3>{presentation.title}</h3>
                        <p>{presentation.summary}</p>
                      </div>
                      <div className={styles.resolvedMeta}>
                        <span>{monitoringStateLabel("resolved")}</span>
                        <small>
                          {formatMonitoringDateTime(
                            alert.resolvedAt ?? alert.lastObservedAt,
                            alert.siteTimezone,
                          )}
                        </small>
                        <Link href={presentation.recordHref}>Ver registro</Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <h3>Nenhum alerta resolvido neste filtro</h3>
                <p>O histórico recente aparecerá aqui conforme as situações forem encerradas.</p>
              </div>
            )}
          </section>
        ) : null}
      </section>
    </main>
  );
}
