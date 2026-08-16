import Link from "next/link";
import type { SalesTrialResults } from "@/src/lib/trial-results";
import { formatTrialDate } from "@/src/trial/status";
import styles from "./trial-results.module.css";

type Props = {
  result: SalesTrialResults;
  viewer: "customer" | "admin";
};

function durationLabel(minutes: number) {
  if (minutes === 60) return "1 hora";
  if (minutes % 60 === 0) return `${minutes / 60} horas`;
  return `${minutes} minutos`;
}

function confidenceLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function isFinished(status: string) {
  return [
    "capture_completed",
    "exploration",
    "converted",
    "expired",
    "purged",
  ].includes(status);
}

export function TrialResultsView({ result, viewer }: Props) {
  const finished = isFinished(result.status);

  return (
    <div className={styles.results}>
      <section className={styles.hero}>
        <div>
          <span>{finished ? "RESULTADO DA DEMONSTRAÇÃO" : "RESULTADO PARCIAL"}</span>
          <h1>
            O que o MonitorIA encontrou em {durationLabel(result.durationMinutes)}
          </h1>
          <p>
            {finished
              ? `A análise gratuita terminou. Este resumo reúne os acontecimentos registrados nas ${result.cameraCount} câmera(s) da demonstração.`
              : "A demonstração ainda está em andamento. Os números abaixo são atualizados com o que já foi consolidado."}
          </p>
        </div>
        <div className={styles.periodCard}>
          <span>EMPRESA</span>
          <strong>{result.organizationName}</strong>
          <small>
            {result.captureStartedAt
              ? `Início: ${formatTrialDate(result.captureStartedAt)}`
              : "Aguardando início"}
          </small>
          <small>
            {result.captureEndsAt
              ? `Fim previsto: ${formatTrialDate(result.captureEndsAt)}`
              : "—"}
          </small>
        </div>
      </section>

      <section className={styles.metrics}>
        <div><span>CÂMERAS</span><strong>{result.cameraCount}</strong><small>Analisadas no mesmo período.</small></div>
        <div><span>ACONTECIMENTOS</span><strong>{result.eventCount}</strong><small>Registros consolidados pela IA.</small></div>
        <div><span>VÍDEOS PRONTOS</span><strong>{result.clipCount}</strong><small>Clipes preservados quando o plano permite.</small></div>
        <div><span>CONTINUIDADES</span><strong>{result.continuationCount}</strong><small>Eventos reconhecidos como sequência.</small></div>
        <div><span>REVISÃO</span><strong>{result.reviewCount}</strong><small>Itens sinalizados para conferência humana.</small></div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>POR CÂMERA</span>
            <h2>Onde a atividade aconteceu</h2>
          </div>
          <strong>{result.cameraCount} participante(s)</strong>
        </div>
        <div className={styles.cameraGrid}>
          {result.cameras.map((camera) => (
            <div className={styles.cameraCard} key={camera.id}>
              <span>{camera.siteName}</span>
              <h3>{camera.name}</h3>
              <div>
                <strong>{camera.eventCount}</strong>
                <small>acontecimento(s)</small>
              </div>
              <div>
                <strong>{camera.clipCount}</strong>
                <small>vídeo(s) pronto(s)</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>DESTAQUES</span>
            <h2>Tipos de acontecimentos mais frequentes</h2>
          </div>
        </div>
        {result.topEventTypes.length ? (
          <div className={styles.typeGrid}>
            {result.topEventTypes.map((item) => (
              <div key={item.type}>
                <strong>{item.count}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Ainda não há acontecimentos relevantes suficientes para montar os destaques.</p>
        )}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>ACONTECIMENTOS RECENTES</span>
            <h2>Uma amostra do que foi registrado</h2>
          </div>
          <strong>Até 12 registros</strong>
        </div>
        {result.recentEvents.length ? (
          <div className={styles.eventList}>
            {result.recentEvents.map((event) => {
              const content = (
                <>
                  <div className={styles.eventTime}>
                    <strong>{event.cameraName}</strong>
                    <span>{formatTrialDate(event.startedAt)}</span>
                  </div>
                  <div className={styles.eventBody}>
                    <span>{event.typeLabel}</span>
                    <h3>{event.headline}</h3>
                    <p>{event.summary}</p>
                  </div>
                  <div className={styles.eventMeta}>
                    <span>{confidenceLabel(event.confidence)} confiança</span>
                    {event.clipReady ? <strong>Vídeo pronto</strong> : null}
                    {event.isContinuation ? <small>Continuação reconhecida</small> : null}
                    {event.requiresReview ? <small>Revisão recomendada</small> : null}
                  </div>
                </>
              );

              return viewer === "customer" ? (
                <Link className={styles.eventRow} href={`/dashboard/events/${event.id}`} key={event.id}>
                  {content}
                </Link>
              ) : (
                <div className={styles.eventRow} key={event.id}>{content}</div>
              );
            })}
          </div>
        ) : (
          <p className={styles.empty}>Nenhum acontecimento consolidado foi registrado até agora.</p>
        )}
      </section>

      {viewer === "customer" ? (
        <section className={styles.conversionCard}>
          <div>
            <span>CONTINUAR MONITORANDO</span>
            <h2>Escolha o plano ideal para cada câmera</h2>
            <p>
              A configuração feita durante a demonstração permanece salva. Você pode contratar as câmeras sem reinstalar o Agent nem refazer a descoberta.
            </p>
          </div>
          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/dashboard/plans">Escolher planos</Link>
            <Link href="/dashboard/events">Explorar acontecimentos</Link>
            <Link href="/dashboard/search">Pesquisar com IA</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
