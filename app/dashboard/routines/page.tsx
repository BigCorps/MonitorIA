import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  addDaysToDateOnly,
  dateOnlyToIso,
  siteTimezone,
} from "@/src/lib/event-search-data";
import { getRoutineOverview } from "@/src/lib/routine-intelligence-data";
import {
  operationalSeverityLabel,
  routineBaselineLabel,
  routineRangeLabel,
  routineScopeLabel,
  routineValueLabel,
} from "@/src/lib/routine-intelligence-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { RoutinesRealtimeRefresh } from "./routines-realtime-refresh";
import styles from "./routines.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Rotinas e mudanças" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}% de confiança`;
}

function dateTimeLabel(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const [sites, cameras, rawParams] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
    searchParams,
  ]);

  const siteId = scalar(rawParams.site);
  const cameraId = scalar(rawParams.camera);
  const severity = scalar(rawParams.severity) || "all";
  const status = scalar(rawParams.status) || "active";
  const baselineStatus = scalar(rawParams.baseline) || "all";
  const timeZone = siteTimezone(sites, siteId);
  const today = todayInZone(timeZone);
  const fromDate = scalar(rawParams.from) || addDaysToDateOnly(today, -13);
  const toDate = scalar(rawParams.to) || today;

  const overview = await getRoutineOverview(organization.id, {
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(addDaysToDateOnly(toDate, 1), timeZone),
    cameraId,
    siteId,
    severity,
    status,
    baselineStatus,
    limit: 160,
  });

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="routines"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              ROTINAS · {organization.name.toUpperCase()}
            </span>
            <h1>Rotinas e mudanças observadas</h1>
            <p>
              O MonitorIA identifica o que costuma acontecer e destaca mudanças
              importantes, sem tirar conclusões sobre intenções.
            </p>
          </div>

          <div className={styles.headerActions}>
            <RoutinesRealtimeRefresh organizationId={organization.id} />
            <Link className="panel-primary-action" href="/dashboard/sessions">
              Ver períodos
            </Link>
          </div>
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.explanation}>
          <div>
            <span>ANÁLISE CUIDADOSA</span>
            <strong>Uma rotina só aparece depois de dias suficientes.</strong>
          </div>
          <p>
            Quando não há registro, isso não prova que algo não aconteceu. Uma
            mudança indica apenas diferença em relação ao habitual.
          </p>
        </section>

        <details className={styles.filterDisclosure}>
          <summary>Filtros de rotinas e mudanças</summary>
          <form className={styles.filters} method="get">
            <label>
              <span>De</span>
              <input type="date" name="from" defaultValue={fromDate} />
            </label>
            <label>
              <span>Até</span>
              <input type="date" name="to" defaultValue={toDate} />
            </label>
            <label>
              <span>Local</span>
              <select name="site" defaultValue={siteId}>
                <option value="">Todos os locais</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Câmera</span>
              <select name="camera" defaultValue={cameraId}>
                <option value="">Todas as câmeras</option>
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Rotina de referência</span>
              <select name="baseline" defaultValue={baselineStatus}>
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="learning">Aprendendo</option>
                <option value="stale">Desatualizados</option>
              </select>
            </label>
            <label>
              <span>Diferenças</span>
              <select name="status" defaultValue={status}>
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="resolved">Resolvidos</option>
                <option value="dismissed">Dispensados</option>
              </select>
            </label>
            <label>
              <span>Prioridade</span>
              <select name="severity" defaultValue={severity}>
                <option value="all">Todas</option>
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
              </select>
            </label>
            <button type="submit">Aplicar filtros</button>
          </form>
        </details>

        <section className={styles.summaryGrid} aria-label="Resumo das rotinas">
          <article>
            <span>ROTINAS IDENTIFICADAS</span>
            <strong>{overview.summary.activeBaselines}</strong>
            <small>padrões com amostra suficiente</small>
          </article>
          <article>
            <span>APRENDENDO</span>
            <strong>{overview.summary.learningBaselines}</strong>
            <small>aguardando mais dias observados</small>
          </article>
          <article>
            <span>DIFERENÇAS ATIVAS</span>
            <strong>{overview.summary.activeDeviations}</strong>
            <small>diferenças no período selecionado</small>
          </article>
          <article data-attention={overview.summary.importantDeviations > 0}>
            <span>ALTA PRIORIDADE</span>
            <strong>{overview.summary.importantDeviations}</strong>
            <small>diferenças importantes</small>
          </article>
        </section>

        <section className={styles.sectionHeading}>
          <div>
            <span>PADRÕES APRENDIDOS</span>
            <h2>Faixas habituais</h2>
          </div>
          <small>{overview.baselines.length} padrão(ões) exibido(s)</small>
        </section>

        {overview.baselines.length ? (
          <div className={styles.baselineGrid}>
            {overview.baselines.map((baseline) => (
              <article className={styles.baselineCard} key={baseline.id}>
                <div className={styles.cardHeading}>
                  <div>
                    <span>{baseline.cameraName}</span>
                    <h3>{routineBaselineLabel(baseline.baselineCode)}</h3>
                  </div>
                  <span data-baseline-status={baseline.status}>
                    {baseline.status === "active"
                      ? "Ativo"
                      : baseline.status === "learning"
                        ? "Aprendendo"
                        : "Desatualizado"}
                  </span>
                </div>

                <strong className={styles.range}>
                  {routineRangeLabel({
                    lower: baseline.lowerValue,
                    center: baseline.centerValue,
                    upper: baseline.upperValue,
                    unit: baseline.unit,
                  })}
                </strong>

                <div className={styles.baselineMeta}>
                  <span>
                    {routineScopeLabel(baseline.dayOfWeek, baseline.bucketHour)}
                  </span>
                  {baseline.sessionType ? (
                    <span>{baseline.sessionType.replaceAll("_", " ")}</span>
                  ) : null}
                  <span>{baseline.dayCount} dias</span>
                  <span>{baseline.sampleCount} amostras</span>
                  <span>{confidenceLabel(baseline.confidence)}</span>
                </div>

                <small>
                  Período analisado: {baseline.periodStart} a{" "}
                  {baseline.periodEnd}
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Ainda não existem rotinas para estes filtros.</strong>
            <p>
              O MonitorIA precisa observar vários dias antes de identificar uma
              faixa habitual confiável.
            </p>
          </div>
        )}

        <section className={styles.sectionHeading}>
          <div>
            <span>COMPARAÇÃO COM O HABITUAL</span>
            <h2>Diferenças observadas</h2>
          </div>
          <small>{overview.deviations.length} ocorrência(s)</small>
        </section>

        {overview.deviations.length ? (
          <div className={styles.deviationList}>
            {overview.deviations.map((deviation) => (
              <article
                className={styles.deviationCard}
                data-severity={deviation.severity}
                key={deviation.id}
              >
                <div className={styles.deviationHeader}>
                  <div>
                    <span>
                      {deviation.cameraName} · {deviation.localDate}
                    </span>
                    <h3>{deviation.title}</h3>
                  </div>
                  <span>{operationalSeverityLabel(deviation.severity)}</span>
                </div>

                <p>{deviation.summary}</p>

                <div className={styles.deviationMeta}>
                  <span>{dateTimeLabel(deviation.observedAt, timeZone)}</span>
                  <span>{confidenceLabel(deviation.confidence)}</span>
                  {deviation.observedValue !== null ? (
                    <span>
                      Observado:{" "}
                      {routineValueLabel(
                        deviation.observedValue,
                        deviation.unit,
                      )}
                    </span>
                  ) : null}
                  {deviation.expectedCenter !== null ? (
                    <span>
                      Habitual:{" "}
                      {routineValueLabel(
                        deviation.expectedCenter,
                        deviation.unit,
                      )}
                    </span>
                  ) : null}
                  <span>
                    {deviation.status === "active" ? "Ativo" : "Resolvido"}
                  </span>
                </div>

                {deviation.evidenceEventIds.length ? (
                  <div className={styles.evidenceLinks}>
                    {deviation.evidenceEventIds
                      .slice(0, 5)
                      .map((eventId, index) => (
                        <Link
                          href={`/dashboard/events/${eventId}`}
                          key={eventId}
                        >
                          Evidência {index + 1}
                        </Link>
                      ))}
                  </div>
                ) : (
                  <small>
                    Esta diferença foi calculada pelo conjunto de registros do
                    período e pode não ter um acontecimento individual.
                  </small>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>
              Nenhuma diferença encontrada para os filtros atuais.
            </strong>
            <p>
              Isso significa apenas que não houve mudança registrada em relação
              às rotinas disponíveis.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
