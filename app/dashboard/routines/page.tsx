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
import {
  getRoutineOverview,
  type RoutineCameraDashboard,
} from "@/src/lib/routine-intelligence-data";
import {
  operationalSeverityLabel,
  routineBaselineLabel,
  routineMinuteToTime,
  routineRangeLabel,
  routineSensitivityLabel,
  routineValueLabel,
} from "@/src/lib/routine-intelligence-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringTime,
  monitoringConfidenceLabel,
} from "@/src/lib/monitoring-display";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../monitoring-analysis-details";
import { RoutineScheduleEditor } from "./routine-schedule-editor";
import { RoutinesRealtimeRefresh } from "./routines-realtime-refresh";
import styles from "./routines.module.css";

export const metadata = { title: "Rotinas" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function minuteNow(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const number = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return number("hour") * 60 + number("minute");
}

function localMinute(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  const number = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return number("hour") * 60 + number("minute");
}

function effectiveTolerance(camera: RoutineCameraDashboard) {
  if (camera.sensitivity === "conservative") {
    return Math.max(camera.graceMinutes, 30);
  }
  if (camera.sensitivity === "sensitive") {
    return Math.min(camera.graceMinutes, 5);
  }
  return camera.graceMinutes;
}

function declaredForToday(camera: RoutineCameraDashboard) {
  const schedule = camera.declaredSchedule;
  if (!schedule.configured) {
    return {
      configured: false,
      closed: false,
      openMinute: null as number | null,
      closeMinute: null as number | null,
    };
  }

  const exception = schedule.exceptions.find(
    (item) => item.date === camera.today.localDate,
  );

  if (exception) {
    return {
      configured: true,
      closed: exception.closed,
      openMinute: exception.openMinute,
      closeMinute: exception.closeMinute,
    };
  }

  const working = schedule.workingDays.includes(camera.today.dayOfWeek);
  return {
    configured: true,
    closed: !working,
    openMinute: working ? schedule.openMinute : null,
    closeMinute: working ? schedule.closeMinute : null,
  };
}

function todayStatus(camera: RoutineCameraDashboard) {
  const declared = declaredForToday(camera);
  const observedOpen = camera.today.observedOpenAt;
  const nowMinute = minuteNow(camera.timezone);

  if (declared.configured && declared.closed) {
    return observedOpen
      ? {
          tone: "attention",
          title: "Abertura observada em dia marcado como fechado",
          detail: `Observado às ${formatMonitoringTime(
            observedOpen,
            camera.timezone,
          )}.`,
        }
      : {
          tone: "good",
          title: "Sem funcionamento esperado hoje",
          detail: "Nenhuma abertura foi confirmada até agora.",
        };
  }

  if (declared.configured && declared.openMinute !== null) {
    const tolerance = effectiveTolerance(camera);

    if (observedOpen) {
      const observedMinute = localMinute(observedOpen, camera.timezone);

      if (observedMinute > declared.openMinute + tolerance) {
        return {
          tone: "attention",
          title: "Abertura depois do horário informado",
          detail: `Esperado ${routineMinuteToTime(
            declared.openMinute,
          )} · observado ${routineMinuteToTime(observedMinute)}.`,
        };
      }

      if (observedMinute < declared.openMinute - tolerance) {
        return {
          tone: "neutral",
          title: "Abertura antes do horário informado",
          detail: `Esperado ${routineMinuteToTime(
            declared.openMinute,
          )} · observado ${routineMinuteToTime(observedMinute)}.`,
        };
      }

      return {
        tone: "good",
        title: "Abertura dentro do horário informado",
        detail: `Observado às ${routineMinuteToTime(observedMinute)}.`,
      };
    }

    return nowMinute > declared.openMinute + tolerance
      ? {
          tone: "attention",
          title: "Abertura ainda não confirmada",
          detail: `Horário informado: ${routineMinuteToTime(
            declared.openMinute,
          )}.`,
        }
      : {
          tone: "neutral",
          title: "Aguardando o horário de abertura",
          detail: `Horário informado: ${routineMinuteToTime(
            declared.openMinute,
          )}.`,
        };
  }

  if (camera.learnedOpen) {
    if (observedOpen) {
      const observedMinute = localMinute(observedOpen, camera.timezone);
      const inside =
        observedMinute >= camera.learnedOpen.lowerValue &&
        observedMinute <= camera.learnedOpen.upperValue;

      return {
        tone: inside ? "good" : "attention",
        title: inside
          ? "Abertura dentro do habitual"
          : "Abertura fora da faixa habitual",
        detail: `Observado ${routineMinuteToTime(
          observedMinute,
        )} · habitual ${routineRangeLabel({
          lower: camera.learnedOpen.lowerValue,
          center: camera.learnedOpen.centerValue,
          upper: camera.learnedOpen.upperValue,
          unit: camera.learnedOpen.unit,
        })}.`,
      };
    }

    return {
      tone: "neutral",
      title: "Monitorando a abertura de hoje",
      detail: `Faixa habitual: ${routineRangeLabel({
        lower: camera.learnedOpen.lowerValue,
        center: camera.learnedOpen.centerValue,
        upper: camera.learnedOpen.upperValue,
        unit: camera.learnedOpen.unit,
      })}.`,
    };
  }

  return {
    tone: "learning",
    title: "Ainda aprendendo esta rotina",
    detail:
      "São necessários vários dias observados antes de formar uma faixa habitual.",
  };
}

function declaredLabel(camera: RoutineCameraDashboard) {
  const today = declaredForToday(camera);

  if (!today.configured) return "Não informado";
  if (today.closed) return "Fechado hoje";
  if (today.openMinute === null || today.closeMinute === null) {
    return "Horário parcial";
  }

  return `${routineMinuteToTime(today.openMinute)}–${routineMinuteToTime(
    today.closeMinute,
  )}`;
}

function learnedLabel(camera: RoutineCameraDashboard) {
  if (!camera.learnedOpen && !camera.learnedClose) return "Ainda aprendendo";

  const open = camera.learnedOpen
    ? routineRangeLabel({
        lower: camera.learnedOpen.lowerValue,
        center: camera.learnedOpen.centerValue,
        upper: camera.learnedOpen.upperValue,
        unit: camera.learnedOpen.unit,
      })
    : "—";

  const close = camera.learnedClose
    ? routineRangeLabel({
        lower: camera.learnedClose.lowerValue,
        center: camera.learnedClose.centerValue,
        upper: camera.learnedClose.upperValue,
        unit: camera.learnedClose.unit,
      })
    : "—";

  return `${open} · ${close}`;
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
  const canManage = ["owner", "admin"].includes(organization.role);

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

  const declaredCount = overview.cameras.filter(
    (camera) => camera.declaredSchedule.configured,
  ).length;

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
            <h1>Rotinas da operação</h1>
            <p>
              Compare o horário que você informou, o padrão que o MonitorIA
              aprendeu e o que realmente foi observado hoje.
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
            <span>TRÊS REFERÊNCIAS SEPARADAS</span>
            <strong>Informado · aprendido · observado</strong>
          </div>
          <p>
            O horário informado nunca substitui o aprendizado. O MonitorIA
            mantém as duas referências separadas para mostrar quando o dia está
            dentro do esperado ou diferente do habitual.
          </p>
        </section>

        <details className={styles.filterDisclosure}>
          <summary>Filtros</summary>
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
              <span>Padrão aprendido</span>
              <select name="baseline" defaultValue={baselineStatus}>
                <option value="all">Todos</option>
                <option value="active">Disponíveis</option>
                <option value="learning">Aprendendo</option>
                <option value="stale">Antigos</option>
              </select>
            </label>
            <label>
              <span>Mudanças</span>
              <select name="status" defaultValue={status}>
                <option value="all">Todas</option>
                <option value="active">Ativas</option>
                <option value="resolved">Resolvidas</option>
                <option value="dismissed">Dispensadas</option>
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
            <span>HORÁRIOS INFORMADOS</span>
            <strong>{declaredCount}</strong>
            <small>câmeras com referência definida por você</small>
          </article>
          <article>
            <span>PADRÕES APRENDIDOS</span>
            <strong>{overview.summary.activeBaselines}</strong>
            <small>faixas com observações suficientes</small>
          </article>
          <article>
            <span>MUDANÇAS ATIVAS</span>
            <strong>{overview.summary.activeDeviations}</strong>
            <small>diferenças no período selecionado</small>
          </article>
          <article data-attention={overview.summary.importantDeviations > 0}>
            <span>PEDEM ATENÇÃO</span>
            <strong>{overview.summary.importantDeviations}</strong>
            <small>prioridade alta ou crítica</small>
          </article>
        </section>

        <section className={styles.sectionHeading}>
          <div>
            <span>HOJE</span>
            <h2>Esperado, habitual e observado</h2>
          </div>
          <small>{overview.cameras.length} câmera(s)</small>
        </section>

        {overview.cameras.length ? (
          <div className={styles.todayGrid}>
            {overview.cameras.map((camera) => {
              const state = todayStatus(camera);

              return (
                <article className={styles.todayCard} key={camera.id}>
                  <div className={styles.todayHeading}>
                    <div>
                      <span>
                        {camera.siteName} · {camera.name}
                      </span>
                      <h3>{state.title}</h3>
                    </div>
                    <span data-tone={state.tone}>{state.detail}</span>
                  </div>

                  <div className={styles.referenceGrid}>
                    <div>
                      <span>HORÁRIO INFORMADO</span>
                      <strong>{declaredLabel(camera)}</strong>
                      <small>
                        {camera.declaredSchedule.configured
                          ? routineSensitivityLabel(camera.sensitivity)
                          : "Opcional"}
                      </small>
                    </div>
                    <div>
                      <span>PADRÃO APRENDIDO</span>
                      <strong>{learnedLabel(camera)}</strong>
                      <small>
                        {camera.learnedOpen
                          ? `Aprendido com ${camera.learnedOpen.dayCount} dia(s)`
                          : "Aguardando mais dias"}
                      </small>
                    </div>
                    <div>
                      <span>OBSERVADO HOJE</span>
                      <strong>
                        {camera.today.observedOpenAt
                          ? `Abriu ${formatMonitoringTime(
                              camera.today.observedOpenAt,
                              camera.timezone,
                            )}`
                          : "Abertura não confirmada"}
                      </strong>
                      <small>
                        {camera.today.observedCloseAt
                          ? `Fechou ${formatMonitoringTime(
                              camera.today.observedCloseAt,
                              camera.timezone,
                            )}`
                          : "Fechamento ainda não observado"}
                      </small>
                    </div>
                  </div>

                  {canManage ? (
                    <RoutineScheduleEditor
                      key={`${camera.id}:${camera.declaredSchedule.workingDays.join(",")}:${camera.declaredSchedule.openMinute}:${camera.declaredSchedule.closeMinute}:${camera.declaredSchedule.exceptions.length}`}
                      cameraId={camera.id}
                      cameraName={camera.name}
                      sensitivity={camera.sensitivity}
                      schedule={camera.declaredSchedule}
                    />
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Nenhuma câmera encontrada para estes filtros.</strong>
          </div>
        )}

        <section className={styles.sectionHeading}>
          <div>
            <span>O QUE COSTUMA ACONTECER</span>
            <h2>Padrões aprendidos</h2>
          </div>
          <small>{overview.baselines.length} padrão(ões)</small>
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
                      ? "Aprendido"
                      : baseline.status === "learning"
                        ? "Aprendendo"
                        : "Antigo"}
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

                <p className={styles.learnedFrom}>
                  Aprendido com {baseline.dayCount} dia
                  {baseline.dayCount === 1 ? "" : "s"} observado
                  {baseline.dayCount === 1 ? "" : "s"}.
                </p>

                <MonitoringAnalysisDetails
                  title="Detalhes do aprendizado"
                  description="Amostras e nível de certeza usados para formar esta faixa."
                >
                  <dl className={styles.analysisList}>
                    <div>
                      <dt>Amostras</dt>
                      <dd>{baseline.sampleCount}</dd>
                    </div>
                    <div>
                      <dt>Nível de certeza</dt>
                      <dd>
                        {monitoringConfidenceLabel(baseline.confidence)} ·{" "}
                        {Math.round(baseline.confidence * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Período analisado</dt>
                      <dd>
                        {baseline.periodStart} a {baseline.periodEnd}
                      </dd>
                    </div>
                  </dl>
                </MonitoringAnalysisDetails>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>O MonitorIA ainda está aprendendo estas rotinas.</strong>
            <p>
              Os padrões aparecem quando existem dias suficientes com
              observações comparáveis.
            </p>
          </div>
        )}

        <section className={styles.sectionHeading}>
          <div>
            <span>DIFERENÇAS</span>
            <h2>O que saiu do esperado ou do habitual</h2>
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
                  <span>
                    {formatMonitoringDateTime(deviation.observedAt, timeZone)}
                  </span>
                  {deviation.observedValue !== null ? (
                    <span>
                      Observado:{" "}
                      {routineValueLabel(deviation.observedValue, deviation.unit)}
                    </span>
                  ) : null}
                  {deviation.expectedCenter !== null ? (
                    <span>
                      Referência:{" "}
                      {routineValueLabel(deviation.expectedCenter, deviation.unit)}
                    </span>
                  ) : null}
                  <span>
                    {deviation.status === "active" ? "Ativa" : "Resolvida"}
                  </span>
                </div>

                {deviation.evidenceEventIds.length ? (
                  <div className={styles.evidenceLinks}>
                    {deviation.evidenceEventIds.slice(0, 5).map((eventId, index) => (
                      <Link href={`/dashboard/events/${eventId}`} key={eventId}>
                        Ver registro {index + 1}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <small>
                    A comparação foi calculada pelo conjunto de observações
                    disponíveis e pode não ter um registro individual.
                  </small>
                )}

                <MonitoringAnalysisDetails
                  title="Detalhes da análise"
                  description="Faixa numérica e nível de certeza usados nesta comparação."
                >
                  <dl className={styles.analysisList}>
                    <div>
                      <dt>Nível de certeza</dt>
                      <dd>
                        {monitoringConfidenceLabel(deviation.confidence)} ·{" "}
                        {Math.round(deviation.confidence * 100)}%
                      </dd>
                    </div>
                    <div>
                      <dt>Limite inferior</dt>
                      <dd>
                        {routineValueLabel(deviation.expectedLower, deviation.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt>Limite superior</dt>
                      <dd>
                        {routineValueLabel(deviation.expectedUpper, deviation.unit)}
                      </dd>
                    </div>
                  </dl>
                </MonitoringAnalysisDetails>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <strong>Nenhuma diferença encontrada para estes filtros.</strong>
            <p>
              Isso significa apenas que não houve uma diferença registrada em
              relação às referências disponíveis.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
