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
import { getOperationalProcessOverview } from "@/src/lib/operational-process-data";
import {
  operationalProcessLabel,
  processDeviationLabel,
  processDurationLabel,
  processInstanceStatusLabel,
  processObservationLabel,
  processScopeLabel,
  processStepStatusLabel,
  processStrictnessLabel,
} from "@/src/lib/operational-process-labels";
import {
  formatMonitoringDateTime,
  monitoringConfidenceLabel,
  monitoringSeverityLabel,
} from "@/src/lib/monitoring-display";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../monitoring-analysis-details";
import {
  pauseProcessDefinitionAction,
  restoreProcessDefinitionAction,
} from "./actions";
import { ProcessDefinitionEditor } from "./process-definition-editor";
import { ProcessesRealtimeRefresh } from "./processes-realtime-refresh";
import styles from "./processes.module.css";

export const metadata = { title: "Processos" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
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

function stepIcon(status: string) {
  if (status === "observed") return "✓";
  if (status === "missing" || status === "out_of_order") return "!";
  if (status === "pending") return "…";
  return "○";
}

export default async function ProcessesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const params = await searchParams;
  const [cameras, sites] = await Promise.all([
    getOrganizationCameras(organization.id),
    getOrganizationSites(organization.id),
  ]);

  const siteId = param(params.site);
  const cameraId = param(params.camera);
  const processCode = param(params.process);
  const status = param(params.status);
  const severity = param(params.severity);
  const timeZone = siteTimezone(sites, siteId);
  const today = todayInZone(timeZone);
  const fromDate = param(params.from) || addDaysToDateOnly(today, -13);
  const toDate = param(params.to) || today;
  const canManage = ["owner", "admin"].includes(organization.role);

  const overview = await getOperationalProcessOverview(organization.id, {
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(addDaysToDateOnly(toDate, 1), timeZone),
    cameraId: cameraId || null,
    siteId: siteId || null,
    processCode: processCode || null,
    status: status || null,
    severity: severity || null,
    limit: 120,
  });

  const activeDefinitions = overview.definitions.filter(
    (definition) => definition.status === "active",
  );
  const processOptions = [
    ...new Set(activeDefinitions.map((definition) => definition.processCode)),
  ];
  const customDefinitions = activeDefinitions.filter(
    (definition) => definition.source !== "system",
  );
  const systemDefinitions = activeDefinitions.filter(
    (definition) => definition.source === "system",
  );
  const editorCameras = cameras.map((camera) => ({
    id: camera.id,
    name: camera.name,
    siteId: camera.siteId,
  }));

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="processes"
      />

      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PROCESSOS · {organization.name.toUpperCase()}
            </span>
            <h1>Processos da operação</h1>
            <p>
              Acompanhe etapas que a câmera conseguiu confirmar e configure o
              que realmente importa para a sua operação.
            </p>
          </div>

          <div className={styles.headerActions}>
            <ProcessesRealtimeRefresh organizationId={organization.id} />
            <Link className="panel-primary-action" href="/dashboard/sessions">
              Ver períodos
            </Link>
          </div>
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.explanation}>
          <div>
            <span>REGRA DE PRODUÇÃO</span>
            <strong>Modelo padrão observa. Sua configuração cobra.</strong>
          </div>
          <p>
            Os modelos padrão ajudam o MonitorIA a organizar o que viu, mas não
            acusam falha na sua empresa. Uma etapa só passa a pedir atenção
            quando owner ou admin cria uma configuração própria.
          </p>
        </section>

        <section className={styles.metrics} aria-label="Resumo dos processos">
          <article>
            <strong>{overview.summary.totalProcesses}</strong>
            <span>ATIVIDADES NO PERÍODO</span>
            <small>processos visuais organizados</small>
          </article>
          <article>
            <strong>{overview.summary.openProcesses}</strong>
            <span>EM ANDAMENTO</span>
            <small>ainda recebendo registros</small>
          </article>
          <article>
            <strong>{overview.summary.incompleteProcesses}</strong>
            <span>PEDEM ATENÇÃO</span>
            <small>somente regras personalizadas</small>
          </article>
          <article>
            <strong>{customDefinitions.length}</strong>
            <span>PERSONALIZAÇÕES</span>
            <small>processos configurados pela empresa</small>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtros</summary>
          <form>
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
                <option value="">Todos</option>
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
                <option value="">Todas</option>
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Processo</span>
              <select name="process" defaultValue={processCode}>
                <option value="">Todos</option>
                {processOptions.map((code) => (
                  <option key={code} value={code}>
                    {operationalProcessLabel(code)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Situação</span>
              <select name="status" defaultValue={status}>
                <option value="">Todas</option>
                <option value="open">Em andamento</option>
                <option value="completed">Concluídos</option>
                <option value="incomplete">Precisam de atenção</option>
                <option value="uncertain">Não confirmados</option>
              </select>
            </label>
            <label>
              <span>Prioridade</span>
              <select name="severity" defaultValue={severity}>
                <option value="">Todas</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="critical">Crítica</option>
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
            <div>
              <span>ATIVIDADES RECENTES</span>
              <h2>O que aconteceu em cada processo</h2>
            </div>
            <small>{overview.instances.length} resultado(s)</small>
          </div>

          <div className={styles.processList}>
            {overview.instances.length ? (
              overview.instances.map((instance) => {
                const configured = instance.definitionSource !== "system";

                return (
                  <article
                    className={styles.processCard}
                    data-configured={configured}
                    id={`process-${instance.id}`}
                    key={instance.id}
                  >
                    <div className={styles.processTop}>
                      <div>
                        <span>
                          {instance.siteName} · {instance.cameraName}
                        </span>
                        <h3>{instance.processName}</h3>
                      </div>
                      <span
                        className={styles.status}
                        data-status={configured ? instance.status : "observed"}
                      >
                        {processInstanceStatusLabel(
                          instance.status,
                          instance.definitionSource,
                        )}
                      </span>
                    </div>

                    <div className={styles.processMeta}>
                      <span>
                        {formatMonitoringDateTime(
                          instance.startedAt,
                          instance.timezone,
                        )}
                      </span>
                      <span>{processDurationLabel(instance.durationSeconds)}</span>
                      <span>
                        {configured
                          ? `Versão ${instance.definitionVersion} personalizada`
                          : "Modelo padrão"}
                      </span>
                    </div>

                    <ol className={styles.steps}>
                      {instance.steps
                        .filter((step) =>
                          configured
                            ? true
                            : !["unexpected", "missing"].includes(step.status),
                        )
                        .map((step) => (
                          <li key={step.id} data-status={step.status}>
                            <span>{stepIcon(step.status)}</span>
                            <div>
                              <strong>{step.stepName}</strong>
                              <small>{processStepStatusLabel(step.status)}</small>
                            </div>
                            {step.eventId ? (
                              <Link href={`/dashboard/events/${step.eventId}`}>
                                Ver registro
                              </Link>
                            ) : null}
                          </li>
                        ))}
                    </ol>

                    <div className={styles.processFooter}>
                      <Link
                        href={`/dashboard/sessions/${instance.operationalSessionId}`}
                      >
                        Abrir período
                      </Link>

                      <MonitoringAnalysisDetails
                        title="Detalhes da análise"
                        description="Informações adicionais sobre a interpretação deste processo."
                      >
                        <dl className={styles.analysisList}>
                          <div>
                            <dt>Nível de certeza</dt>
                            <dd>
                              {monitoringConfidenceLabel(instance.confidence)} ·{" "}
                              {Math.round(instance.confidence * 100)}%
                            </dd>
                          </div>
                          <div>
                            <dt>Etapas confirmadas</dt>
                            <dd>
                              {instance.requiredStepsCompleted}/
                              {instance.requiredStepsTotal}
                            </dd>
                          </div>
                          <div>
                            <dt>Modelo usado</dt>
                            <dd>
                              {configured
                                ? `Personalizado · v${instance.definitionVersion}`
                                : "Padrão do MonitorIA"}
                            </dd>
                          </div>
                          <div>
                            <dt>Estado interno</dt>
                            <dd>{instance.status}</dd>
                          </div>
                        </dl>
                      </MonitoringAnalysisDetails>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className={styles.empty}>
                Nenhum processo foi encontrado com os filtros atuais.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>ATENÇÃO</span>
              <h2>Diferenças em regras personalizadas</h2>
            </div>
            <small>{overview.deviations.length} ocorrência(s)</small>
          </div>

          {overview.deviations.length ? (
            <div className={styles.deviationList}>
              {overview.deviations.map((deviation) => (
                <article className={styles.deviationCard} key={deviation.id}>
                  <span data-severity={deviation.severity}>
                    {monitoringSeverityLabel(deviation.severity)}
                  </span>
                  <div>
                    <h3>{processDeviationLabel(deviation.deviationCode)}</h3>
                    <p>{deviation.summary}</p>
                    <small>{deviation.cameraName}</small>
                  </div>
                  <Link href={`#process-${deviation.processInstanceId}`}>
                    Ver processo
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              Nenhuma regra personalizada está pedindo atenção neste período.
            </div>
          )}
        </section>

        {overview.refinements.length ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <span>SUGESTÕES DE REFINAMENTO</span>
                <h2>Padrões que vale revisar</h2>
              </div>
            </div>

            <div className={styles.refinementGrid}>
              {overview.refinements.map((suggestion) => (
                <article key={suggestion.key}>
                  <span>{suggestion.processName}</span>
                  <h3>{suggestion.title}</h3>
                  <p>{suggestion.detail}</p>
                  <small>
                    É apenas uma sugestão. Nada será alterado automaticamente.
                  </small>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>CONFIGURAÇÃO</span>
              <h2>Como você quer acompanhar seus processos</h2>
            </div>
            <small>
              {canManage ? "owner/admin pode editar" : "somente leitura"}
            </small>
          </div>

          {customDefinitions.length ? (
            <div className={styles.customGrid}>
              {customDefinitions.map((definition) => (
                <article
                  className={styles.definitionCard}
                  key={definition.id}
                  id={`definition-${definition.id}`}
                >
                  <div className={styles.definitionHeading}>
                    <div>
                      <span>PERSONALIZADO</span>
                      <h3>{definition.name}</h3>
                    </div>
                    <strong>v{definition.version}</strong>
                  </div>

                  <p>{definition.description}</p>
                  <div className={styles.definitionMeta}>
                    <span>
                      {processScopeLabel(
                        definition.source,
                        definition.siteName,
                        definition.cameraName,
                      )}
                    </span>
                    <span>{processStrictnessLabel(definition.strictness)}</span>
                  </div>

                  <ol className={styles.definitionSteps}>
                    {definition.steps.map((step, index) => (
                      <li key={step.id}>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{step.name}</strong>
                          <small>
                            {step.required ? "Obrigatória" : "Opcional"} ·{" "}
                            {step.acceptedChapterTypes
                              .map(processObservationLabel)
                              .join(", ")}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>

                  {canManage ? (
                    <>
                      <ProcessDefinitionEditor
                        definition={definition}
                        sites={sites}
                        cameras={editorCameras}
                      />

                      <form action={pauseProcessDefinitionAction}>
                        <input
                          type="hidden"
                          name="definition_id"
                          value={definition.id}
                        />
                        <button className={styles.secondaryAction} type="submit">
                          Desativar esta personalização
                        </button>
                      </form>
                    </>
                  ) : null}
                </article>
              ))}
            </div>
          ) : null}

          <div className={styles.systemGrid}>
            {systemDefinitions.map((definition) => (
              <article className={styles.definitionCard} key={definition.id}>
                <div className={styles.definitionHeading}>
                  <div>
                    <span>MODELO PADRÃO</span>
                    <h3>{definition.name}</h3>
                  </div>
                  <strong>Observação</strong>
                </div>

                <p>{definition.description}</p>

                <ol className={styles.definitionSteps}>
                  {definition.steps.map((step, index) => (
                    <li key={step.id}>
                      <span>{index + 1}</span>
                      <div>
                        <strong>{step.name}</strong>
                        <small>
                          Referência visual ·{" "}
                          {step.acceptedChapterTypes
                            .map(processObservationLabel)
                            .join(", ")}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>

                {canManage ? (
                  <ProcessDefinitionEditor
                    definition={definition}
                    sites={sites}
                    cameras={editorCameras}
                  />
                ) : null}
              </article>
            ))}
          </div>
        </section>

        {canManage && overview.history.length ? (
          <section className={styles.section}>
            <MonitoringAnalysisDetails
              title="Versões anteriores"
              description="Histórico preservado das personalizações. Restaurar cria uma nova versão; não apaga a atual."
            >
              <div className={styles.historyList}>
                {overview.history.map((definition) => (
                  <div key={definition.id}>
                    <div>
                      <strong>
                        {definition.name} · v{definition.version}
                      </strong>
                      <small>
                        {processScopeLabel(
                          definition.source,
                          definition.siteName,
                          definition.cameraName,
                        )}{" "}
                        ·{" "}
                        {definition.status === "paused"
                          ? "desativada"
                          : "anterior"}
                      </small>
                    </div>

                    <form action={restoreProcessDefinitionAction}>
                      <input
                        type="hidden"
                        name="definition_id"
                        value={definition.id}
                      />
                      <button type="submit">Restaurar como nova versão</button>
                    </form>
                  </div>
                ))}
              </div>
            </MonitoringAnalysisDetails>
          </section>
        ) : null}
      </main>
    </div>
  );
}
