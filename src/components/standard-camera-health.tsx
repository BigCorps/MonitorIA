import Link from "next/link";
import type { OrganizationCameraRecoveryHealth } from "@/src/lib/camera-recovery-data";
import { CameraRecoveryPanel } from "@/src/components/camera-recovery-panel";
import styles from "./standard-camera-health.module.css";
// camera.monitorActive continua fazendo parte do diagnóstico, agora no CameraRecoveryPanel compartilhado.

function relativeDate(value: string | null) {
  if (!value) return "Ainda sem análise concluída";
  const elapsed = Date.now() - Date.parse(value);
  if (!Number.isFinite(elapsed) || elapsed < 0) return "Análise recente";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 2) return "Última análise agora";
  if (minutes < 60) return `Última análise há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `Última análise há ${hours} h`;
  return `Última análise há ${Math.floor(hours / 24)} d`;
}

function tone(status: string) {
  if (status === "monitoring") return "good";
  if (status === "attention_required") return "attention";
  if (status === "offline") return "offline";
  if (status === "needs_configuration") return "setup";
  if (status === "ready_to_monitor") return "ready";
  return "connecting";
}

export function StandardCameraHealth({
  data,
  selectedSiteId,
  selectedCameraId,
}: {
  data: OrganizationCameraRecoveryHealth;
  selectedSiteId: string;
  selectedCameraId: string | null;
}) {
  const filtered =
    selectedSiteId === "all"
      ? data.cameras
      : data.cameras.filter((camera) => camera.siteId === selectedSiteId);

  const selectedSite = data.sites.find((site) => site.id === selectedSiteId);
  const summary = {
    monitoring: filtered.filter((camera) => camera.status === "monitoring").length,
    setup: filtered.filter((camera) =>
      ["connecting", "needs_configuration", "ready_to_monitor"].includes(camera.status),
    ).length,
    attention: filtered.filter((camera) => camera.status === "attention_required").length,
    offline: filtered.filter((camera) => camera.status === "offline").length,
  };
  const agents = selectedSite
    ? { total: selectedSite.agentsTotal, online: selectedSite.agentsOnline }
    : data.agents;

  return (
    <section className={styles.section} id="saude">
      <div className={styles.heading}>
        <div>
          <span>ESTADO REAL DAS CÂMERAS</span>
          <h2>Conectada não basta. Veja quem está realmente monitorando.</h2>
          <p>
            O MonitorIA cruza conexão, imagem, plano, perfil e monitor local.
            Quando algo não fecha, o diagnóstico separa a causa e orienta a
            recuperação sem esconder o problema.
          </p>
        </div>

        <form action="/dashboard/cameras" method="get" className={styles.filter}>
          <label htmlFor="site-filter">Local</label>
          <div>
            <select id="site-filter" name="site" defaultValue={selectedSiteId}>
              <option value="all">Todos os locais</option>
              {data.sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
            <button type="submit">Aplicar</button>
          </div>
          <small>
            {selectedSite
              ? `${selectedSite.cameras} câmera(s) neste Local`
              : `${data.sites.length} local(is) na empresa`}
          </small>
        </form>
      </div>

      <div className={styles.summary}>
        <article><span>MONITORANDO</span><strong>{summary.monitoring}</strong><small>monitor realmente ativo</small></article>
        <article><span>CONFIGURAÇÃO</span><strong>{summary.setup}</strong><small>ainda falta uma etapa</small></article>
        <article><span>ATENÇÃO</span><strong>{summary.attention}</strong><small>precisam de verificação</small></article>
        <article><span>OFFLINE</span><strong>{summary.offline}</strong><small>sem sinal recente</small></article>
        <article><span>COMPUTADORES</span><strong>{agents.online}/{agents.total}</strong><small>conectados recentemente</small></article>
      </div>

      {filtered.length ? (
        <div className={styles.grid}>
          {filtered.map((camera) => {
            const diagnosticOpen =
              selectedCameraId === camera.id ||
              !["healthy", "recording_ready"].includes(camera.diagnosis.issue);
            const refreshHref = `/dashboard/cameras?site=${encodeURIComponent(
              selectedSiteId,
            )}&camera=${encodeURIComponent(camera.id)}#saude`;

            return (
              <article
                className={styles.card}
                data-selected={selectedCameraId === camera.id}
                key={camera.id}
              >
                <div className={styles.top}>
                  <div><span>{camera.siteName}</span><h3>{camera.name}</h3></div>
                  <b data-tone={tone(camera.status)}>{camera.label}</b>
                </div>
                <p className={styles.description}>{camera.description}</p>

                <div className={styles.checklist}>
                  {camera.checklist.filter((item) => item.applicable).map((item) => (
                    <div key={item.key} data-complete={item.complete} data-warning={item.warning}>
                      <i>{item.complete ? "✓" : item.warning ? "!" : "○"}</i>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>

                <div className={styles.line}>
                  <strong>
                    {camera.remainingSteps === 0
                      ? camera.status === "monitoring"
                        ? "Tudo funcionando"
                        : "Configuração essencial concluída"
                      : `${camera.remainingSteps} etapa(s) restante(s)`}
                  </strong>
                  <span>{relativeDate(camera.latestAnalysisAt)}</span>
                </div>

                <div className={styles.actions}>
                  <Link href={camera.action.href}>{camera.action.label}</Link>
                  <Link href={`/dashboard/cameras/${camera.id}`}>Abrir câmera</Link>
                </div>

                <CameraRecoveryPanel
                  camera={camera}
                  variant="standard"
                  refreshHref={refreshHref}
                  open={diagnosticOpen}
                />
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>Nenhuma câmera neste contexto.</strong>
          <p>Escolha outro Local ou procure novas câmeras.</p>
          <Link href="/dashboard/cameras/discovery">Procurar câmeras</Link>
        </div>
      )}
    </section>
  );
}
