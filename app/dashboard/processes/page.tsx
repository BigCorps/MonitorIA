import Link from "next/link";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { getOperationalProcessOverview } from "@/src/lib/operational-process-data";
import {
  operationalProcessLabel,
  processDeviationLabel,
  processDurationLabel,
  processInstanceStatusLabel,
  processProgressLabel,
  processStepStatusLabel,
} from "@/src/lib/operational-process-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { ProcessesRealtimeRefresh } from "./processes-realtime-refresh";
import styles from "./processes.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isoOrNull(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return <main>Organização não encontrada.</main>;
  }

  const params = await searchParams;
  const from = isoOrNull(param(params.from));
  const to = isoOrNull(param(params.to));
  const cameraId = param(params.camera);
  const siteId = param(params.site);
  const processCode = param(params.process);
  const status = param(params.status);
  const severity = param(params.severity);

  const [cameras, sites, overview] = await Promise.all([
    getOrganizationCameras(organization.id),
    getOrganizationSites(organization.id),
    getOperationalProcessOverview(organization.id, {
      from,
      to,
      cameraId: cameraId || null,
      siteId: siteId || null,
      processCode: processCode || null,
      status: status || null,
      severity: severity || null,
      limit: 120,
    }),
  ]);

  const processOptions = [...new Set(
    overview.definitions.map((definition) => definition.processCode),
  )];

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="processes"
      />

      <main className={`dashboard-content ${styles.page}`}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>INTELIGÊNCIA OPERACIONAL</span>
            <h1>Processos e ações</h1>
            <p>
              Sequências visuais reconstruídas a partir das sessões, com etapas
              observadas, pendentes e não confirmadas.
            </p>
          </div>
          <ProcessesRealtimeRefresh organizationId={organization.id} />
        </header>

        <section className={styles.metrics} aria-label="Resumo dos processos">
          <article><strong>{overview.summary.totalProcesses}</strong><span>Processos</span></article>
          <article><strong>{overview.summary.openProcesses}</strong><span>Em andamento</span></article>
          <article><strong>{overview.summary.completedProcesses}</strong><span>Concluídos</span></article>
          <article><strong>{overview.summary.incompleteProcesses}</strong><span>Etapas não confirmadas</span></article>
          <article><strong>{overview.summary.activeDeviations}</strong><span>Desvios ativos</span></article>
        </section>

        <details className={styles.filters}>
          <summary>Filtros dos processos</summary>
          <form>
            <label>
              De
              <input type="datetime-local" name="from" defaultValue={param(params.from)} />
            </label>
            <label>
              Até
              <input type="datetime-local" name="to" defaultValue={param(params.to)} />
            </label>
            <label>
              Local
              <select name="site" defaultValue={siteId}>
                <option value="">Todos</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <label>
              Câmera
              <select name="camera" defaultValue={cameraId}>
                <option value="">Todas</option>
                {cameras.map((camera) => <option key={camera.id} value={camera.id}>{camera.name}</option>)}
              </select>
            </label>
            <label>
              Processo
              <select name="process" defaultValue={processCode}>
                <option value="">Todos</option>
                {processOptions.map((code) => <option key={code} value={code}>{operationalProcessLabel(code)}</option>)}
              </select>
            </label>
            <label>
              Estado
              <select name="status" defaultValue={status}>
                <option value="">Todos</option>
                <option value="open">Em andamento</option>
                <option value="completed">Concluído</option>
                <option value="incomplete">Incompleto</option>
                <option value="uncertain">Incerto</option>
              </select>
            </label>
            <label>
              Severidade
              <select name="severity" defaultValue={severity}>
                <option value="">Todas</option>
                <option value="info">Informativo</option>
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
                <option value="critical">Crítico</option>
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href="/dashboard/processes">Limpar</Link>
            </div>
          </form>
        </details>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><span>PROCESSOS OBSERVADOS</span><h2>Execuções recentes</h2></div>
            <small>{overview.instances.length} resultados</small>
          </div>

          <div className={styles.processList}>
            {overview.instances.length ? overview.instances.map((instance) => (
              <article className={styles.processCard} id={`process-${instance.id}`} key={instance.id}>
                <div className={styles.processTop}>
                  <div>
                    <span>{instance.cameraName}</span>
                    <h3>{instance.processName}</h3>
                  </div>
                  <span className={`${styles.status} ${styles[instance.status]}`}>
                    {processInstanceStatusLabel(instance.status)}
                  </span>
                </div>

                <p>{instance.summary}</p>

                <div className={styles.progressRow}>
                  <div className={styles.progress}>
                    <span style={{ width: processProgressLabel(instance.progressRatio) }} />
                  </div>
                  <strong>{processProgressLabel(instance.progressRatio)}</strong>
                </div>

                <div className={styles.processMeta}>
                  <span>{instance.requiredStepsCompleted}/{instance.requiredStepsTotal} etapas obrigatórias</span>
                  <span>{processDurationLabel(instance.durationSeconds)}</span>
                  <span>Confiança {confidenceLabel(instance.confidence)}</span>
                </div>

                <ol className={styles.steps}>
                  {instance.steps.map((step) => (
                    <li key={step.id} className={styles[step.status]}>
                      <span>{step.expectedOrder || step.observedOrder || "•"}</span>
                      <div>
                        <strong>{step.stepName}</strong>
                        <small>{processStepStatusLabel(step.status)}</small>
                      </div>
                      {step.eventId ? <Link href={`/dashboard/events/${step.eventId}`}>Evidência</Link> : null}
                    </li>
                  ))}
                </ol>

                <footer>
                  <time dateTime={instance.startedAt}>{new Date(instance.startedAt).toLocaleString("pt-BR")}</time>
                  <Link href={`/dashboard/sessions/${instance.operationalSessionId}`}>Abrir sessão</Link>
                </footer>
              </article>
            )) : (
              <div className={styles.empty}>Nenhum processo foi reconstruído com os filtros atuais.</div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><span>ATENÇÃO</span><h2>Desvios de processo</h2></div>
          </div>
          <div className={styles.deviationList}>
            {overview.deviations.length ? overview.deviations.map((deviation) => (
              <article className={styles.deviationCard} key={deviation.id}>
                <span className={`${styles.severity} ${styles[deviation.severity]}`}>{deviation.severity}</span>
                <div>
                  <h3>{processDeviationLabel(deviation.deviationCode)}</h3>
                  <p>{deviation.summary}</p>
                  <small>{deviation.cameraName} · confiança {confidenceLabel(deviation.confidence)}</small>
                </div>
                <Link href={`#process-${deviation.processInstanceId}`}>Processo</Link>
              </article>
            )) : <div className={styles.empty}>Nenhum desvio de processo encontrado.</div>}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div><span>DEFINIÇÕES ATIVAS</span><h2>Como os processos são interpretados</h2></div>
          </div>
          <div className={styles.definitionGrid}>
            {overview.definitions.map((definition) => (
              <article key={definition.id}>
                <span>{definition.source === "system" ? "Modelo genérico" : "Personalizado"}</span>
                <h3>{definition.name}</h3>
                <p>{definition.description}</p>
                <ol>
                  {definition.steps.map((step) => (
                    <li key={step.id}>
                      <strong>{step.sortOrder}. {step.name}</strong>
                      <small>{step.required ? "Obrigatória" : "Opcional"}</small>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
