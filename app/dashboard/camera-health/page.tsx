import Link from "next/link";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
} from "@/src/lib/dashboard-data";
import { getCameraHealthOverview } from "@/src/lib/camera-health-data";
import {
  cameraHealthIssueLabel,
  cameraHealthMetric,
  cameraHealthPercent,
  cameraHealthStatusLabel,
} from "@/src/lib/camera-health-labels";
import CameraHealthRealtimeRefresh from "./camera-health-realtime-refresh";
import {
  approveCameraHealthBaselineAction,
  dismissCameraHealthIncidentAction,
  rejectCameraHealthBaselineAction,
} from "./actions";
import styles from "./camera-health.module.css";

import { DashboardSidebar } from "../dashboard-sidebar";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

function referenceStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Ativa",
    learning: "Em aprendizado",
    proposed: "Aguardando revisão",
    stale: "Desatualizada",
  };

  return labels[status] ?? "Ainda não definida";
}

export default async function CameraHealthPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization)
    return (
      <main className={styles.page}>
        <p>Organização não encontrada.</p>
      </main>
    );
  const params = await searchParams;
  const cameraId = first(params.camera);
  const incidentStatus = first(params.status);
  const [overview, cameras] = await Promise.all([
    getCameraHealthOverview(organization.id, { cameraId, incidentStatus }),
    getOrganizationCameras(organization.id),
  ]);
  const canManage = ["owner", "admin"].includes(organization.role);

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="camera-health"
      />

      <main className={`dashboard-content ${styles.page}`}>
        <DashboardSectionTabs group="monitoring" />
        <header className={styles.hero}>
          <div>
            <span>FUNCIONAMENTO DAS CÂMERAS</span>
            <h1>Funcionamento das câmeras</h1>
            <p>
              Veja se a imagem está clara, nítida, desobstruída e no
              enquadramento esperado.
            </p>
          </div>
          <CameraHealthRealtimeRefresh organizationId={organization.id} />
        </header>

        <section
          className={styles.metrics}
          aria-label="Resumo da saúde das câmeras"
        >
          <article>
            <strong>{overview.summary.enabled}</strong>
            <span>Monitoradas</span>
          </article>
          <article>
            <strong>{overview.summary.healthy}</strong>
            <span>Funcionando bem</span>
          </article>
          <article>
            <strong>{overview.summary.learning}</strong>
            <span>Em aprendizado</span>
          </article>
          <article>
            <strong>{overview.summary.degraded}</strong>
            <span>Precisam de atenção</span>
          </article>
          <article>
            <strong>{overview.summary.critical}</strong>
            <span>Com problemas graves</span>
          </article>
          <article>
            <strong>{overview.summary.activeIncidents}</strong>
            <span>Alertas ativos</span>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtros</summary>
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
              Alerta
              <select name="status" defaultValue={incidentStatus}>
                <option value="">Ativos</option>
                <option value="resolved">Resolvidos</option>
                <option value="dismissed">Descartados</option>
              </select>
            </label>
            <div>
              <button type="submit">Aplicar</button>
              <Link href="/dashboard/camera-health">Limpar</Link>
            </div>
          </form>
        </details>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>ESTADO ATUAL</span>
              <h2>Câmeras</h2>
            </div>
          </div>
          <div className={styles.cameraGrid}>
            {overview.cameras.map((camera) => (
              <article className={styles.cameraCard} key={camera.id}>
                <header>
                  <div>
                    <span>{camera.siteName}</span>
                    <h3>{camera.name}</h3>
                  </div>
                  <strong
                    className={`${styles.badge} ${styles[camera.healthStatus]}`}
                  >
                    {cameraHealthStatusLabel(camera.healthStatus)}
                  </strong>
                </header>
                <p>
                  {camera.enabled
                    ? `Verificação a cada ${Math.round(camera.intervalSeconds / 60)} minuto(s).`
                    : "Verificação automática desativada nesta câmera."}
                </p>
                <div className={styles.cardStats}>
                  <span>
                    <b>{camera.activeIncidents}</b> alertas
                  </span>
                  <span>
                    <b>{referenceStatusLabel(camera.baselineStatus)}</b>{" "}
                    referência
                  </span>
                  <span>
                    <b>
                      {camera.lastObservedAt
                        ? new Date(camera.lastObservedAt).toLocaleString(
                            "pt-BR",
                          )
                        : "—"}
                    </b>{" "}
                    última verificação
                  </span>
                </div>
                {camera.latestObservation ? (
                  <div className={styles.metricGrid}>
                    <span>
                      Luz{" "}
                      <b>
                        {cameraHealthMetric(
                          camera.latestObservation.brightnessMean,
                        )}
                      </b>
                    </span>
                    <span>
                      Contraste{" "}
                      <b>
                        {cameraHealthMetric(
                          camera.latestObservation.contrastStddev,
                        )}
                      </b>
                    </span>
                    <span>
                      Detalhes{" "}
                      <b>
                        {cameraHealthPercent(
                          camera.latestObservation.edgeDensity,
                        )}
                      </b>
                    </span>
                    <span>
                      Nitidez{" "}
                      <b>
                        {cameraHealthMetric(camera.latestObservation.blurScore)}
                      </b>
                    </span>
                    <span>
                      Escuro{" "}
                      <b>
                        {cameraHealthPercent(
                          camera.latestObservation.darkPixelRatio,
                        )}
                      </b>
                    </span>
                    <span>
                      Mudança de posição{" "}
                      <b>
                        {cameraHealthPercent(
                          camera.latestObservation.baselineDistance,
                        )}
                      </b>
                    </span>
                  </div>
                ) : (
                  <p className={styles.muted}>Nenhuma verificação recebida.</p>
                )}
                {camera.latestObservation?.issueCodes.length ? (
                  <ul>
                    {camera.latestObservation.issueCodes.map((code) => (
                      <li key={code}>{cameraHealthIssueLabel(code)}</li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>VERIFICAÇÃO NECESSÁRIA</span>
              <h2>Alertas</h2>
            </div>
          </div>
          <div className={styles.incidentList}>
            {overview.incidents.length ? (
              overview.incidents.map((incident) => (
                <article
                  className={`${styles.incident} ${styles[incident.severity]}`}
                  key={incident.id}
                >
                  <header>
                    <div>
                      <span>
                        {incident.siteName} · {incident.cameraName}
                      </span>
                      <h3>{incident.title}</h3>
                    </div>
                    <strong>{incident.severity}</strong>
                  </header>
                  <p>{incident.summary}</p>
                  <ul>
                    {incident.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <footer>
                    <span>
                      {cameraHealthPercent(incident.confidence)} de certeza ·{" "}
                      {incident.consecutiveCount} verificações
                    </span>
                    <span>
                      {new Date(incident.lastObservedAt).toLocaleString(
                        "pt-BR",
                      )}
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
                        name="notes"
                        placeholder="Motivo opcional"
                        maxLength={600}
                      />
                      <button type="submit">Descartar após verificar</button>
                    </form>
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                Nenhum alerta encontrado para o filtro atual.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>REFERÊNCIA DA IMAGEM</span>
              <h2>Referências sugeridas</h2>
            </div>
            <small>{overview.summary.proposedBaselines} pendentes</small>
          </div>
          <div className={styles.baselineList}>
            {overview.baselines
              .filter((baseline) => baseline.status === "proposed")
              .map((baseline) => (
                <article key={baseline.id}>
                  <header>
                    <div>
                      <span>{baseline.cameraName}</span>
                      <h3>Referência sugerida · revisão {baseline.version}</h3>
                    </div>
                    <strong>{cameraHealthPercent(baseline.confidence)}</strong>
                  </header>
                  <p>
                    {baseline.sampleCount} imagens em {baseline.distinctDays}{" "}
                    dia(s). {baseline.notes}
                  </p>
                  {canManage ? (
                    <div className={styles.baselineActions}>
                      <form action={approveCameraHealthBaselineAction}>
                        <input
                          type="hidden"
                          name="baseline_id"
                          value={baseline.id}
                        />
                        <input
                          name="notes"
                          placeholder="Observação opcional"
                          maxLength={600}
                        />
                        <button type="submit">Aprovar referência</button>
                      </form>
                      <form action={rejectCameraHealthBaselineAction}>
                        <input
                          type="hidden"
                          name="baseline_id"
                          value={baseline.id}
                        />
                        <input
                          name="notes"
                          placeholder="Motivo"
                          maxLength={600}
                        />
                        <button className={styles.secondary} type="submit">
                          Rejeitar
                        </button>
                      </form>
                    </div>
                  ) : null}
                </article>
              ))}
            {!overview.baselines.some(
              (baseline) => baseline.status === "proposed",
            ) ? (
              <div className={styles.empty}>
                Nenhuma referência aguardando aprovação.
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
