import { TrialCountdown } from "@/app/dashboard/trial/trial-countdown";
import { VipLiveRefresh } from "@/src/components/vip-live-refresh";
import type { VipTrialLiveSnapshot } from "@/src/vip/live";
import styles from "./vip-seller-live.module.css";

type Props = {
  snapshot: VipTrialLiveSnapshot;
};

function finished(status: string) {
  return [
    "capture_completed",
    "exploration",
    "expired",
    "purged",
    "converted",
  ].includes(status);
}

export function VipSellerLivePanel({ snapshot }: Props) {
  const running = snapshot.trialStatus === "running";
  const closed = finished(snapshot.trialStatus);

  return (
    <section className={styles.panel}>
      {running ? <VipLiveRefresh intervalMs={10_000} /> : null}

      <header className={styles.header}>
        <div>
          <span>{running ? "● PILOTO VIP AO VIVO" : "MONITORIA VIP"}</span>
          <h2>
            {running
              ? "Acompanhe o cliente durante os mesmos 60 minutos"
              : closed
                ? "A captura terminou; os resultados continuam disponíveis"
                : "Piloto preparado para este projeto VIP"}
          </h2>
          <p>
            {running
              ? "Este painel usa o mesmo relógio e os mesmos dados vistos pelo cliente. Atualiza automaticamente sem iniciar uma segunda sessão."
              : "O vendedor acompanha status operacional e resultados, sem acessar senhas, credenciais RTSP ou segredos das câmeras."}
          </p>
        </div>

        {running && snapshot.captureEndsAt ? (
          <TrialCountdown
            target={snapshot.captureEndsAt}
            label="Tempo restante do cliente"
            compact
          />
        ) : (
          <div className={styles.statusBadge} data-finished={closed}>
            {closed ? "CAPTURA CONCLUÍDA" : snapshot.trialStatus.toUpperCase()}
          </div>
        )}
      </header>

      <div className={styles.metrics}>
        <article>
          <span>CÂMERAS</span>
          <strong>{snapshot.camerasOnline}/{snapshot.cameraCount}</strong>
          <small>online no piloto</small>
        </article>
        <article>
          <span>ACONTECIMENTOS</span>
          <strong>{snapshot.eventCount}</strong>
          <small>consolidados</small>
        </article>
        <article>
          <span>PESQUISA IA</span>
          <strong>{snapshot.assistantUsed}/{snapshot.assistantIncluded}</strong>
          <small>perguntas usadas</small>
        </article>
        <article>
          <span>AGENTS</span>
          <strong>{snapshot.agentsOnline}</strong>
          <small>online agora</small>
        </article>
      </div>

      <div className={styles.cameraGrid}>
        {snapshot.cameras.map((camera) => (
          <article key={camera.id}>
            <div>
              <span>{camera.siteName}</span>
              <strong>{camera.name}</strong>
            </div>
            <div className={styles.cameraState}>
              <b data-online={camera.cameraStatus === "online"}>
                {camera.cameraStatus === "online" ? "Câmera online" : "Câmera offline"}
              </b>
              <small>
                {camera.agentStatus === "online"
                  ? "Agent online"
                  : "Agent requer atenção"}
              </small>
            </div>
          </article>
        ))}
      </div>

      <div className={styles.securityNote}>
        <strong>Acompanhamento seguro</strong>
        <span>
          Este painel expõe somente estado operacional e métricas do piloto.
          Usuário, senha, URL RTSP e demais credenciais nunca são exibidas ao vendedor.
        </span>
      </div>
    </section>
  );
}
