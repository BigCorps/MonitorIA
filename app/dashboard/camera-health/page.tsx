import Link from "next/link";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { getCameraHealthOverview } from "@/src/lib/camera-health-data";
import {
  cameraHealthCanUseAsReference,
  cameraHealthChecks,
  cameraHealthHeadline,
  cameraHealthIssueLabel,
  cameraHealthIssueRecommendation,
  cameraHealthMetric,
  cameraHealthPercent,
  cameraHealthPrimaryIssue,
  cameraHealthStatusLabel,
} from "@/src/lib/camera-health-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringTime,
  monitoringSeverityLabel,
} from "@/src/lib/monitoring-display";
import CameraHealthRealtimeRefresh from "./camera-health-realtime-refresh";
import {
  approveCameraHealthBaselineAction,
  dismissCameraHealthIncidentAction,
  rejectCameraHealthBaselineAction,
  replaceCameraHealthReferenceAction,
} from "./actions";
import styles from "./camera-health.module.css";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../monitoring-analysis-details";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

function framingChanged(issueCodes: string[]) {
  return issueCodes.some((code) =>
    ["frame_shifted", "profile_drift"].includes(code),
  );
}

export default async function CameraHealthPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return (
      <main className={styles.pageFallback}>
        <p>Organização não encontrada.</p>
      </main>
    );
  }

  const params = await searchParams;
  const cameraId = first(params.camera);
  const incidentStatus = first(params.status);

  const [overview, cameras, sites] = await Promise.all([
    getCameraHealthOverview(organization.id, {
      cameraId,
      incidentStatus,
    }),
    getOrganizationCameras(organization.id),
    getOrganizationSites(organization.id),
  ]);

  const canManage = ["owner", "admin"].includes(organization.role);
  const timeZoneBySite = new Map(
    sites.map((site) => [site.id, site.timezone] as const),
  );

  const proposedBaselines = overview.baselines.filter(
    (baseline) => baseline.status === "proposed",
  );
  const missingReferences = overview.cameras.filter(
    (camera) => camera.baselineStatus === "missing",
  );

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="camera-health"
      />

      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              FUNCIONAMENTO · {organization.name.toUpperCase()}
            </span>
            <h1>Funcionamento das câmeras</h1>
            <p>
              O MonitorIA verifica automaticamente se a imagem continua clara,
              nítida e no enquadramento esperado. Quando algo muda, você recebe
              uma orientação simples do que conferir.
            </p>
          </div>
          <CameraHealthRealtimeRefresh organizationId={organization.id} />
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.introCard}>
          <div>
            <strong>Verificação automática da imagem</strong>
            <p>
              A câmera é comparada com uma referência visual aprovada. Isso
              ajuda a perceber câmera deslocada, imagem escura, lente obstruída,
              desfoque e outras mudanças antes que elas prejudiquem o
              monitoramento.
            </p>
          </div>
          <span>Sem alterar a gravação da câmera</span>
        </section>

        <section
          className={styles.metrics}
          aria-label="Resumo do funcionamento das câmeras"
        >
          <article>
            <strong>{overview.summary.enabled}</strong>
            <span>Câmeras verificadas</span>
          </article>
          <article>
            <strong>{overview.summary.healthy}</strong>
            <span>Funcionando normalmente</span>
          </article>
          <article>
            <strong>
              {overview.summary.degraded + overview.summary.critical}
            </strong>
            <span>Precisam de atenção</span>
          </article>
          <article>
            <strong>
              {overview.summary.proposedBaselines + missingReferences.length}
            </strong>
            <span>Referências para confirmar</span>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtrar câmeras</summary>
          <form>
            <label>
              Câmera
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
              Situações
              <select name="status" defaultValue={incidentStatus}>
                <option value="">Ativas</option>
                <option value="resolved">Resolvidas</option>
                <option value="dismissed">Verificadas e encerradas</option>
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href="/dashboard/camera-health">Limpar</Link>
            </div>
          </form>
        </details>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>ESTADO ATUAL</span>
              <h2>Como estão suas câmeras</h2>
            </div>
            <small>{overview.cameras.length} câmeras</small>
          </div>

          <div className={styles.cameraGrid}>
            {overview.cameras.length ? (
              overview.cameras.map((camera) => {
                const observation = camera.latestObservation;
                const issueCodes = observation?.issueCodes ?? [];
                const primaryIssue = cameraHealthPrimaryIssue(issueCodes);
                const hasBaseline = camera.baselineStatus === "active";
                const checks = cameraHealthChecks(issueCodes, {
                  hasObservation: Boolean(observation),
                  hasBaseline,
                });
                const timeZone = timeZoneBySite.get(camera.siteId);
                const relatedIncident = overview.incidents.find(
                  (incident) => incident.cameraId === camera.id,
                );

                return (
                  <article className={styles.cameraCard} key={camera.id}>
                    <header className={styles.cameraHeader}>
                      <div>
                        <span>{camera.siteName}</span>
                        <h3>
                          {camera.name} —{" "}
                          {cameraHealthHeadline(
                            camera.healthStatus,
                            issueCodes,
                            Boolean(observation),
                          )}
                        </h3>
                      </div>
                      <strong
                        className={`${styles.badge} ${styles[camera.healthStatus]}`}
                      >
                        {cameraHealthStatusLabel(camera.healthStatus)}
                      </strong>
                    </header>

                    <div className={styles.checkList}>
                      {checks.map((check) => (
                        <div
                          className={`${styles.checkItem} ${styles[check.tone]}`}
                          key={check.label}
                        >
                          <span aria-hidden="true">
                            {check.tone === "ok"
                              ? "✓"
                              : check.tone === "attention"
                                ? "!"
                                : "•"}
                          </span>
                          <strong>{check.label}</strong>
                        </div>
                      ))}
                    </div>

                    <div className={styles.lastCheck}>
                      <span>Última verificação</span>
                      <strong>
                        {camera.lastObservedAt
                          ? formatMonitoringDateTime(
                              camera.lastObservedAt,
                              timeZone,
                            )
                          : "Ainda não recebida"}
                      </strong>
                    </div>

                    {primaryIssue && primaryIssue !== "baseline_required" ? (
                      <div className={styles.problemBox}>
                        <div>
                          <strong>{cameraHealthIssueLabel(primaryIssue)}</strong>
                          <span>
                            {relatedIncident?.lastObservedAt ||
                            observation?.capturedAt
                              ? `Detectado às ${formatMonitoringTime(
                                  relatedIncident?.lastObservedAt ??
                                    observation?.capturedAt,
                                  timeZone,
                                )}`
                              : "Situação detectada"}
                          </span>
                        </div>
                        <p>{cameraHealthIssueRecommendation(primaryIssue)}</p>
                      </div>
                    ) : null}

                    {canManage &&
                    hasBaseline &&
                    observation &&
                    framingChanged(issueCodes) &&
                    cameraHealthCanUseAsReference(issueCodes) ? (
                      <details className={styles.referenceUpdate}>
                        <summary>A câmera foi reposicionada de propósito?</summary>
                        <p>
                          Se esta passou a ser a posição normal, o MonitorIA pode
                          usar a imagem mais recente como nova referência. A
                          referência anterior fica preservada no histórico.
                        </p>
                        <form action={replaceCameraHealthReferenceAction}>
                          <input
                            type="hidden"
                            name="camera_id"
                            value={camera.id}
                          />
                          <input
                            type="hidden"
                            name="notes"
                            value="Reposicionamento intencional confirmado pelo administrador na tela Funcionamento."
                          />
                          <button type="submit">
                            Sim, atualizar a referência visual
                          </button>
                        </form>
                      </details>
                    ) : null}

                    <MonitoringAnalysisDetails
                      title="Detalhes da imagem"
                      description="Métricas técnicas usadas para acompanhar a qualidade e o enquadramento."
                    >
                      {observation ? (
                        <div className={styles.technicalGrid}>
                          <span>
                            <small>brightness_mean</small>
                            <strong>
                              {cameraHealthMetric(observation.brightnessMean)}
                            </strong>
                          </span>
                          <span>
                            <small>contrast_stddev</small>
                            <strong>
                              {cameraHealthMetric(observation.contrastStddev)}
                            </strong>
                          </span>
                          <span>
                            <small>edge_density</small>
                            <strong>
                              {cameraHealthPercent(observation.edgeDensity)}
                            </strong>
                          </span>
                          <span>
                            <small>blur_score</small>
                            <strong>
                              {cameraHealthMetric(observation.blurScore)}
                            </strong>
                          </span>
                          <span>
                            <small>dark_pixel_ratio</small>
                            <strong>
                              {cameraHealthPercent(observation.darkPixelRatio)}
                            </strong>
                          </span>
                          <span>
                            <small>baseline_distance</small>
                            <strong>
                              {cameraHealthPercent(observation.baselineDistance)}
                            </strong>
                          </span>
                        </div>
                      ) : (
                        <p className={styles.muted}>
                          Ainda não há uma verificação técnica para esta câmera.
                        </p>
                      )}
                    </MonitoringAnalysisDetails>
                  </article>
                );
              })
            ) : (
              <div className={styles.empty}>
                Nenhuma câmera encontrada para este filtro.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>REFERÊNCIA VISUAL</span>
              <h2>Confirme a posição normal das câmeras</h2>
            </div>
            <small>{proposedBaselines.length} aguardando confirmação</small>
          </div>

          <p className={styles.sectionHelp}>
            A referência visual serve apenas para perceber mudanças de imagem e
            enquadramento. Uma nova referência nunca substitui a anterior sem
            confirmação de um administrador.
          </p>

          <div className={styles.referenceList}>
            {proposedBaselines.length ? (
              proposedBaselines.map((baseline) => (
                <article className={styles.referenceCard} key={baseline.id}>
                  <div>
                    <span>{baseline.cameraName}</span>
                    <h3>Esta é a posição normal desta câmera?</h3>
                    <p>
                      O MonitorIA observou uma imagem estável em{" "}
                      {baseline.sampleCount} verificações ao longo de{" "}
                      {baseline.distinctDays} dia(s) e preparou uma referência
                      para sua confirmação.
                    </p>
                  </div>

                  {canManage ? (
                    <div className={styles.referenceActions}>
                      <form action={approveCameraHealthBaselineAction}>
                        <input
                          type="hidden"
                          name="baseline_id"
                          value={baseline.id}
                        />
                        <input
                          type="hidden"
                          name="notes"
                          value="Referência visual confirmada pelo administrador na tela Funcionamento."
                        />
                        <button type="submit">Sim, usar como referência</button>
                      </form>
                      <form action={rejectCameraHealthBaselineAction}>
                        <input
                          type="hidden"
                          name="baseline_id"
                          value={baseline.id}
                        />
                        <input
                          type="hidden"
                          name="notes"
                          value="Referência visual recusada pelo administrador na tela Funcionamento."
                        />
                        <button className={styles.secondary} type="submit">
                          Não, manter como está
                        </button>
                      </form>
                    </div>
                  ) : (
                    <p className={styles.readOnlyNote}>
                      Um administrador precisa confirmar esta referência.
                    </p>
                  )}

                  <MonitoringAnalysisDetails
                    title="Detalhes da referência"
                    description="Informações de aprendizado que justificaram esta sugestão."
                  >
                    <div className={styles.referenceStats}>
                      <span>
                        <strong>{baseline.sampleCount}</strong>
                        verificações
                      </span>
                      <span>
                        <strong>{baseline.distinctDays}</strong>
                        dias observados
                      </span>
                      <span>
                        <strong>
                          {cameraHealthPercent(baseline.confidence)}
                        </strong>
                        consistência
                      </span>
                      <span>
                        <strong>v{baseline.version}</strong>
                        versão
                      </span>
                    </div>
                  </MonitoringAnalysisDetails>
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                {missingReferences.length
                  ? "O MonitorIA ainda está observando as câmeras que não possuem uma referência confirmada. A sugestão aparecerá aqui quando houver imagens estáveis suficientes."
                  : "Todas as câmeras deste filtro já possuem uma referência visual confirmada ou não têm revisão pendente."}
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>SITUAÇÕES DETECTADAS</span>
              <h2>O que merece sua atenção</h2>
            </div>
            <small>{overview.incidents.length} registros</small>
          </div>

          <p className={styles.sectionHelp}>
            Aqui ficam as situações de funcionamento detectadas pelas câmeras.
            O histórico é mantido mesmo depois que você confirma que já
            verificou o problema.
          </p>

          <div className={styles.incidentList}>
            {overview.incidents.length ? (
              overview.incidents.map((incident) => {
                const camera = overview.cameras.find(
                  (item) => item.id === incident.cameraId,
                );
                const timeZone = camera
                  ? timeZoneBySite.get(camera.siteId)
                  : undefined;

                return (
                  <article
                    className={`${styles.incident} ${styles[incident.severity]}`}
                    key={incident.id}
                  >
                    <header>
                      <div>
                        <span>
                          {incident.siteName} · {incident.cameraName}
                        </span>
                        <h3>{cameraHealthIssueLabel(incident.incidentType)}</h3>
                      </div>
                      <strong>
                        {monitoringSeverityLabel(incident.severity)}
                      </strong>
                    </header>

                    <p>
                      {cameraHealthIssueRecommendation(incident.incidentType)}
                    </p>

                    <footer>
                      <span>
                        Detectado em{" "}
                        {formatMonitoringDateTime(
                          incident.lastObservedAt,
                          timeZone,
                        )}
                      </span>
                      <span>
                        {incident.consecutiveCount > 1
                          ? `${incident.consecutiveCount} verificações relacionadas`
                          : "1 verificação relacionada"}
                      </span>
                    </footer>

                    {canManage &&
                    ["observing", "open"].includes(incident.status) ? (
                      <form action={dismissCameraHealthIncidentAction}>
                        <input
                          type="hidden"
                          name="incident_id"
                          value={incident.id}
                        />
                        <input
                          type="hidden"
                          name="notes"
                          value="Situação verificada pelo administrador na tela Funcionamento."
                        />
                        <button className={styles.secondary} type="submit">
                          Já verifiquei esta situação
                        </button>
                      </form>
                    ) : null}
                  </article>
                );
              })
            ) : (
              <div className={styles.empty}>
                Nenhuma situação encontrada para o filtro atual.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
