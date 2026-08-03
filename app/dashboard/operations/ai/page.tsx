import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getAiCostDashboardData } from "@/src/lib/ai-cost-data";
import { statusLabel, type AiOperationalStatus } from "@/src/ai-cost/status";
import {
  acknowledgeAiCostAlertAction,
  refreshAiCostNowAction,
  updateAiCostSettingsAction,
} from "./actions";
import styles from "./ai-cost.module.css";

export const metadata = { title: "Operação de IA" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    month?: string;
    organization?: string;
  }>;
};

function currentMonth() {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

function validMonth(value: string | undefined) {
  return value && /^\d{4}-\d{2}-01$/.test(value) ? value : currentMonth();
}

function money(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function decimal(value: number, digits = 2) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function percentFromBasisPoints(value: number | null) {
  if (value === null) return "—";
  return `${decimal(value / 100, 1)}%`;
}

function formatMonth(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function statusClass(status: string) {
  if (status === "critical") return styles.critical;
  if (status === "warning") return styles.warning;
  if (status === "healthy") return styles.healthy;
  return styles.neutral;
}

function alertTypeLabel(type: string) {
  if (type === "projected_ai_cost") return "Custo projetado da IA";
  if (type === "escalation_rate") return "Taxa de escalonamento";
  return "Integridade da telemetria";
}

export default async function AiOperationsPage({ searchParams }: Props) {
  const user = await requireInternalOperator();
  const query = await searchParams;
  const month = validMonth(query.month);
  const organizationId = query.organization?.trim() || undefined;
  const data = await getAiCostDashboardData(month, organizationId);

  const totals = data.reports.reduce(
    (result, report) => ({
      jobs: result.jobs + report.jobsCount,
      calls: result.calls + report.totalModelCalls,
      productionUsd: result.productionUsd + report.productionAiCostUsd,
      experimentalUsd: result.experimentalUsd + report.experimentalAiCostUsd,
      projectedCents:
        result.projectedCents + (report.projected30dAiCostBrlCents ?? 0),
      targetCents: result.targetCents + report.targetMaxCogsCents,
      critical: result.critical + (report.overallStatus === "critical" ? 1 : 0),
      warning: result.warning + (report.overallStatus === "warning" ? 1 : 0),
    }),
    {
      jobs: 0,
      calls: 0,
      productionUsd: 0,
      experimentalUsd: 0,
      projectedCents: 0,
      targetCents: 0,
      critical: 0,
      warning: 0,
    },
  );

  const productionBrlCents = Math.round(
    totals.productionUsd * data.settings.usdToBrl * 100,
  );
  const experimentalBrlCents = Math.round(
    totals.experimentalUsd * data.settings.usdToBrl * 100,
  );

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div>
          <Link href="/dashboard">← Voltar ao dashboard</Link>
          <span>OPERAÇÃO INTERNA · BIGCORPS</span>
          <h1>Controle de IA e margem</h1>
          <p>
            Custos, projeções e limites comerciais. Esta tela não decide prompts,
            complexidade ou modelos.
          </p>
        </div>
        <div className={styles.operator}>
          <span>Operador autorizado</span>
          <strong>{user.email}</strong>
        </div>
      </header>

      <section className={styles.toolbar}>
        <form method="get" className={styles.filters}>
          <label>
            Mês
            <select name="month" defaultValue={month}>
              {(data.months.length ? data.months : [month]).map((item) => (
                <option key={item} value={item}>
                  {formatMonth(item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Organização
            <select name="organization" defaultValue={organizationId ?? ""}>
              <option value="">Todas</option>
              {data.organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <button type="submit">Aplicar filtros</button>
        </form>

        <form action={refreshAiCostNowAction}>
          <input type="hidden" name="month" value={month} />
          <button className={styles.secondaryButton} type="submit">
            Recalcular agora
          </button>
        </form>
      </section>

      <section className={styles.summaryGrid}>
        <article>
          <span>IA de produção observada</span>
          <strong>{money(productionBrlCents)}</strong>
          <small>{decimal(totals.productionUsd, 6)} USD</small>
        </article>
        <article>
          <span>Experimentos A/B</span>
          <strong>{money(experimentalBrlCents)}</strong>
          <small>separados do custo operacional</small>
        </article>
        <article>
          <span>Projeção para 30 dias</span>
          <strong>{money(totals.projectedCents)}</strong>
          <small>baseada no ritmo observado</small>
        </article>
        <article>
          <span>Teto total de COGS</span>
          <strong>{money(totals.targetCents)}</strong>
          <small>não representa apenas IA</small>
        </article>
        <article>
          <span>Jobs / chamadas</span>
          <strong>{totals.jobs.toLocaleString("pt-BR")}</strong>
          <small>{totals.calls.toLocaleString("pt-BR")} chamadas de modelo</small>
        </article>
        <article>
          <span>Câmeras em risco</span>
          <strong>{totals.critical + totals.warning}</strong>
          <small>{totals.critical} crítica(s) · {totals.warning} em atenção</small>
        </article>
      </section>

      <section className={styles.coordinationNote}>
        <div>
          <span>COORDENAÇÃO COM A INTELIGÊNCIA</span>
          <h2>Monitoramento comercial, sem roteador paralelo</h2>
        </div>
        <p>
          O limite de escalonamento vem do catálogo comercial. O score, o motivo
          da rota, o verificador e a escolha do modelo continuarão pertencendo ao
          gateway da INT-3.5. Até essa telemetria ser aplicada, o painel usa o
          histórico de <code>model_chain</code> e marca a origem como legado.
        </p>
      </section>

      <section className={styles.settingsSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span>CONFIGURAÇÃO OPERACIONAL</span>
            <h2>Câmbio e sensibilidade da projeção</h2>
          </div>
          <small>Atualizado em {new Date(data.settings.updatedAt).toLocaleString("pt-BR")}</small>
        </div>

        <form action={updateAiCostSettingsAction} className={styles.settingsForm}>
          <input type="hidden" name="month" value={month} />
          <label>
            USD → BRL
            <input
              name="usdToBrl"
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              defaultValue={data.settings.usdToBrl}
              required
            />
          </label>
          <label>
            Aviso em % do teto
            <input
              name="warningTargetPercent"
              type="number"
              min="1"
              max="100"
              defaultValue={data.settings.warningTargetPercent}
              required
            />
          </label>
          <label>
            Crítico em % do teto
            <input
              name="criticalTargetPercent"
              type="number"
              min="1"
              max="500"
              defaultValue={data.settings.criticalTargetPercent}
              required
            />
          </label>
          <label>
            Mínimo de jobs
            <input
              name="projectionMinJobs"
              type="number"
              min="1"
              defaultValue={data.settings.projectionMinJobs}
              required
            />
          </label>
          <label>
            Mínimo de horas
            <input
              name="projectionMinHours"
              type="number"
              min="0.1"
              max="744"
              step="0.1"
              defaultValue={data.settings.projectionMinHours}
              required
            />
          </label>
          <button type="submit">Salvar e recalcular</button>
        </form>
      </section>

      <section className={styles.alertSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span>ALERTAS</span>
            <h2>Pontos que exigem revisão</h2>
          </div>
          <strong>{data.alerts.length}</strong>
        </div>

        {data.alerts.length ? (
          <div className={styles.alertList}>
            {data.alerts.map((alert) => {
              const camera = data.reports.find(
                (report) => report.cameraId === alert.cameraId,
              );
              return (
                <article className={statusClass(alert.severity)} key={alert.id}>
                  <div>
                    <span>{alertTypeLabel(alert.alertType)}</span>
                    <h3>{camera?.cameraName ?? "Câmera"}</h3>
                    <p>
                      {camera?.organizationName ?? "Organização"} · {formatMonth(alert.usageMonth)}
                    </p>
                  </div>
                  <div className={styles.alertValue}>
                    <span>{alert.severity === "critical" ? "Crítico" : "Atenção"}</span>
                    <strong>
                      {alert.unit === "BRL_CENTS"
                        ? money(alert.observedValue)
                        : alert.unit === "BASIS_POINTS"
                          ? percentFromBasisPoints(alert.observedValue)
                          : decimal(alert.observedValue ?? 0, 0)}
                    </strong>
                  </div>
                  {alert.status !== "acknowledged" ? (
                    <form action={acknowledgeAiCostAlertAction}>
                      <input type="hidden" name="alertId" value={alert.id} />
                      <button type="submit">Marcar como visto</button>
                    </form>
                  ) : (
                    <span className={styles.acknowledged}>Reconhecido</span>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>Nenhum alerta aberto neste mês.</div>
        )}
      </section>

      <section className={styles.cameraSection}>
        <div className={styles.sectionHeading}>
          <div>
            <span>CÂMERAS</span>
            <h2>Consumo e projeção por câmera</h2>
          </div>
          <strong>{data.reports.length}</strong>
        </div>

        {data.reports.length ? (
          <div className={styles.cameraGrid}>
            {data.reports.map((report) => {
              const utilization = Math.max(
                0,
                Math.min(
                  100,
                  (report.projectedCostTargetUtilizationBasisPoints ?? 0) / 100,
                ),
              );
              return (
                <article className={styles.cameraCard} key={`${report.cameraId}-${report.usageMonth}`}>
                  <header>
                    <div>
                      <span>{report.organizationName}</span>
                      <h3>{report.cameraName}</h3>
                      <p>{report.planName}</p>
                    </div>
                    <strong className={statusClass(report.overallStatus)}>
                      {statusLabel(report.overallStatus as AiOperationalStatus)}
                    </strong>
                  </header>

                  <div className={styles.costLine}>
                    <div>
                      <span>Projeção IA</span>
                      <strong>{money(report.projected30dAiCostBrlCents)}</strong>
                    </div>
                    <div>
                      <span>Teto COGS</span>
                      <strong>{money(report.targetMaxCogsCents)}</strong>
                    </div>
                    <div>
                      <span>Preço de referência</span>
                      <strong>{money(report.referencePriceCents)}</strong>
                    </div>
                  </div>

                  <div className={styles.progressTrack}>
                    <span style={{ width: `${utilization}%` }} />
                  </div>
                  <small className={styles.progressLabel}>
                    {percentFromBasisPoints(
                      report.projectedCostTargetUtilizationBasisPoints,
                    )} do teto total de COGS
                  </small>

                  <dl className={styles.metricsGrid}>
                    <div><dt>Jobs</dt><dd>{report.jobsCount.toLocaleString("pt-BR")}</dd></div>
                    <div><dt>Eventos</dt><dd>{report.relevantEvents.toLocaleString("pt-BR")}</dd></div>
                    <div><dt>Chamadas</dt><dd>{report.totalModelCalls.toLocaleString("pt-BR")}</dd></div>
                    <div><dt>Nano / Mini</dt><dd>{report.nanoCalls} / {report.miniCalls}</dd></div>
                    <div><dt>Escalonamento</dt><dd>{percentFromBasisPoints(report.escalationRateBasisPoints)}</dd></div>
                    <div><dt>Limite comercial</dt><dd>{report.maximumEscalationPercent}%</dd></div>
                    <div><dt>Latência média</dt><dd>{report.avgLatencyMs === null ? "—" : `${decimal(report.avgLatencyMs / 1000, 1)} s`}</dd></div>
                    <div><dt>P95</dt><dd>{report.p95LatencyMs === null ? "—" : `${decimal(report.p95LatencyMs / 1000, 1)} s`}</dd></div>
                    <div><dt>Confiança</dt><dd>{report.avgConfidence === null ? "—" : `${decimal(report.avgConfidence * 100, 1)}%`}</dd></div>
                    <div><dt>Revisão</dt><dd>{percentFromBasisPoints(report.reviewRateBasisPoints)}</dd></div>
                    <div><dt>Falhas</dt><dd>{percentFromBasisPoints(report.failedRateBasisPoints)}</dd></div>
                    <div><dt>Amostra</dt><dd>{decimal(report.observationHours, 1)} h</dd></div>
                  </dl>

                  <footer>
                    <span>
                      Produção: {money(Math.round(report.productionAiCostUsd * data.settings.usdToBrl * 100))}
                    </span>
                    <span>
                      A/B: {money(Math.round(report.experimentalAiCostUsd * data.settings.usdToBrl * 100))}
                    </span>
                    <span>
                      Roteamento INT-3.5: {report.routingTelemetryAvailable ? "integrado" : "pendente"}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>
            Nenhum dado de IA para {formatMonth(month)}.
          </div>
        )}
      </section>
    </main>
  );
}
