import Link from "next/link";
import type { OrganizationCameraProductHealth } from "@/src/lib/camera-product-state-data";
import styles from "./vip-camera-health.module.css";

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

function stateTone(status: string) {
  if (status === "monitoring") return "good";
  if (status === "attention_required") return "attention";
  if (status === "offline") return "offline";
  if (status === "needs_configuration") return "setup";
  if (status === "ready_to_monitor") return "ready";
  return "connecting";
}

export function VipCameraHealth({
  data,
  selectedSiteId,
  selectedCameraId,
}: {
  data: OrganizationCameraProductHealth;
  selectedSiteId: string;
  selectedCameraId: string | null;
}) {
  const filtered =
    selectedSiteId === "all"
      ? data.cameras
      : data.cameras.filter((camera) => camera.siteId === selectedSiteId);

  const selectedSite = data.sites.find((site) => site.id === selectedSiteId);
  const scopeSummary = {
    monitoring: filtered.filter((camera) => camera.status === "monitoring").length,
    setup: filtered.filter((camera) =>
      ["connecting", "needs_configuration", "ready_to_monitor"].includes(camera.status),
    ).length,
    attention: filtered.filter((camera) => camera.status === "attention_required").length,
    offline: filtered.filter((camera) => camera.status === "offline").length,
  };
  const scopeAgents = selectedSite
    ? { total: selectedSite.agentsTotal, online: selectedSite.agentsOnline }
    : data.agents;

  return (
    <section className={styles.section} id="saude">
      <div className={styles.heading}>
        <div>
          <span>SAÚDE DA OPERAÇÃO</span>
          <h2>Conectada não basta. Aqui você vê quem está realmente monitorando.</h2>
          <p>
            Cada câmera mostra o que já está pronto, o que falta e qual é o próximo
            botão. Detalhes técnicos ficam recolhidos.
          </p>
        </div>

        <form action="/vip/dashboard" method="get" className={styles.siteFilter}>
          <label htmlFor="vip-site-filter">Local</label>
          <div>
            <select id="vip-site-filter" name="site" defaultValue={selectedSiteId}>
              <option value="all">Todos os locais</option>
              {data.sites.map((site) => (
                <option value={site.id} key={site.id}>
                  {site.name}
                </option>
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
        <article>
          <span>MONITORANDO</span>
          <strong>{scopeSummary.monitoring}</strong>
          <small>configuração e monitor ativos</small>
        </article>
        <article>
          <span>CONFIGURAÇÃO</span>
          <strong>
            {scopeSummary.setup}
          </strong>
          <small>ainda precisam de uma etapa</small>
        </article>
        <article>
          <span>ATENÇÃO</span>
          <strong>{scopeSummary.attention}</strong>
          <small>monitoramento precisa de verificação</small>
        </article>
        <article>
          <span>OFFLINE</span>
          <strong>{scopeSummary.offline}</strong>
          <small>sem sinal recente</small>
        </article>
        <article>
          <span>COMPUTADORES</span>
          <strong>{scopeAgents.online}/{scopeAgents.total}</strong>
          <small>conectados recentemente</small>
        </article>
      </div>

      {filtered.length ? (
        <div className={styles.cameraGrid}>
          {filtered.map((camera) => (
            <article
              className={styles.cameraCard}
              data-selected={selectedCameraId === camera.id}
              key={camera.id}
            >
              <div className={styles.cameraTop}>
                <div>
                  <span>{camera.siteName}</span>
                  <h3>{camera.name}</h3>
                </div>
                <b data-tone={stateTone(camera.status)}>{camera.label}</b>
              </div>

              <p className={styles.description}>{camera.description}</p>

              <div className={styles.checklist}>
                {camera.checklist
                  .filter((item) => item.applicable)
                  .map((item) => (
                    <div
                      key={item.key}
                      data-complete={item.complete}
                      data-warning={item.warning}
                    >
                      <i>{item.complete ? "✓" : item.warning ? "!" : "○"}</i>
                      <span>{item.label}</span>
                    </div>
                  ))}
              </div>

              <div className={styles.statusLine}>
                <strong>
                  {camera.remainingSteps === 0
                    ? camera.status === "monitoring"
                      ? "Tudo funcionando"
                      : "Configuração essencial concluída"
                    : `${camera.remainingSteps} etapa(s) restante(s)`}
                </strong>
                <span>{relativeDate(camera.latestAnalysisAt)}</span>
              </div>

              {camera.status === "attention_required" ? (
                <div className={styles.attentionHelp}>
                  <strong>
                    {["degraded", "critical"].includes(camera.visualHealthStatus ?? "")
                      ? "A qualidade visual desta câmera precisa de atenção."
                      : "Imagem e conexão continuam disponíveis."}
                  </strong>
                  <span>
                    {["degraded", "critical"].includes(camera.visualHealthStatus ?? "")
                      ? "O MonitorIA detectou degradação recente da imagem. Confira o diagnóstico antes de depender desta câmera."
                      : "Há sinal de que o monitoramento parou de produzir normalmente. Nesta versão verificamos o diagnóstico sem alterar parâmetros da câmera automaticamente."}
                  </span>
                </div>
              ) : null}

              <div className={styles.actions}>
                <Link href={camera.action.href}>{camera.action.label}</Link>
                <Link href={`/dashboard/cameras/${camera.id}`}>Abrir câmera</Link>
              </div>

              <details className={styles.technical}>
                <summary>Ver diagnóstico avançado</summary>
                <dl>
                  <div>
                    <dt>Fonte</dt>
                    <dd>{camera.sourceKind === "local_recording" ? "gravação local" : "câmera ao vivo"}</dd>
                  </div>
                  <div>
                    <dt>Conexão da câmera</dt>
                    <dd>{camera.cameraOnline ? "OK" : "sem sinal"}</dd>
                  </div>
                  <div>
                    <dt>Computador responsável</dt>
                    <dd>{camera.agentOnline && camera.agentHeartbeatRecent ? "OK" : "sem sinal recente"}</dd>
                  </div>
                  <div>
                    <dt>Liberação</dt>
                    <dd>{camera.planReady ? camera.planCode ?? "ativa" : "pendente"}</dd>
                  </div>
                  <div>
                    <dt>Perfil</dt>
                    <dd>{camera.profileReady ? "ativo" : "pendente"}</dd>
                  </div>
                  <div>
                    <dt>Monitor local</dt>
                    <dd>{camera.monitorActive ? "ativo" : "não confirmado"}</dd>
                  </div>
                  <div>
                    <dt>Saúde visual</dt>
                    <dd>{camera.visualHealthStatus ?? "ainda sem leitura"}</dd>
                  </div>
                </dl>
              </details>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>Nenhuma câmera neste contexto.</strong>
          <p>Escolha outro Local ou continue a implantação para adicionar câmeras.</p>
          <Link href="/vip/onboarding">Continuar implantação</Link>
        </div>
      )}
    </section>
  );
}
