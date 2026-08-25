import Link from "next/link";
import type { SearchEventRow } from "@/src/lib/event-search-data";
import type { TimelineSearchRow } from "@/src/lib/event-timeline-data";
import { eventTypeLabel } from "@/src/lib/event-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringDuration,
} from "@/src/lib/monitoring-display";
import { EventThumbnailImage } from "./event-thumbnail";
import styles from "./events.module.css";

type Row = SearchEventRow | TimelineSearchRow;
type Props = {
  rows: Row[];
  timezone?: string;
  emptyMessage?: string;
  detailParams?: Record<string, string>;
};

function detailHref(eventId: string, detailParams: Record<string, string> | undefined) {
  const query = new URLSearchParams(detailParams);
  const suffix = query.toString();
  return `/dashboard/events/${eventId}${suffix ? `?${suffix}` : ""}`;
}

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isProcessing(row: Row): row is TimelineSearchRow {
  return "rowKind" in row && row.rowKind === "analysis";
}

function CardContents({ event, timezone }: { event: Row; timezone: string }) {
  const processing = isProcessing(event);
  return (
    <>
      <div className={styles.thumbnail}>
        {event.thumbnailAssetId ? (
          <EventThumbnailImage assetId={event.thumbnailAssetId} />
        ) : (
          <img className={styles.fallbackLogo} src="/favicon.svg" alt="" />
        )}
        {processing ? (
          <span data-kind="processing">
            {event.processingStatus === "failed_terminal"
              ? "Atenção"
              : event.processingStatus === "failed" || event.processingStatus === "retry"
                ? "Retomando…"
                : "Analisando…"}
          </span>
        ) : event.requiresReview && !event.humanVerdict ? (
          <span data-kind="review">Revisar</span>
        ) : event.humanVerdict === "irrelevant" ? (
          <span data-kind="irrelevant">Irrelevante</span>
        ) : null}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <div>
            <span>{event.siteName} · {event.cameraName}</span>
            <h2>{event.headline}</h2>
          </div>
          <time>{formatMonitoringDateTime(event.startedAt, timezone)}</time>
        </div>

        <p>{event.summary}</p>

        <div className={styles.meta}>
          {processing ? (
            <>
              <span data-state="processing">
                {event.processingStatus === "failed_terminal"
                  ? "Evidência preservada"
                  : "IA em processamento"}
              </span>
              <span>◷ {formatMonitoringDuration(event.durationSeconds)}</span>
              {event.processingStatus === "failed" || event.processingStatus === "retry" ? (
                <span data-state="pending">Recuperação automática ativa</span>
              ) : null}
              {event.processingStatus === "failed_terminal" ? (
                <span data-state="pending">Atenção técnica necessária</span>
              ) : null}
            </>
          ) : (
            <>
              <span>{eventTypeLabel(event.eventType)}</span>
              <span>◎ {countLabel(event.peopleCount, "pessoa", "pessoas")}</span>
              <span>◇ {countLabel(event.vehicleCount, "veículo", "veículos")}</span>
              {event.probableCustomerCount > 0 ? (
                <span>≈ {countLabel(event.probableCustomerCount, "cliente provável", "clientes prováveis")}</span>
              ) : null}
              <span>◷ {formatMonitoringDuration(event.durationSeconds)}</span>
              {event.requiresReview && !event.humanVerdict ? (
                <span data-state="pending">Revisão recomendada</span>
              ) : null}
              {event.humanVerdict === "irrelevant" ? (
                <span data-state="irrelevant">Marcado como irrelevante</span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function EventList({
  rows,
  timezone = "America/Sao_Paulo",
  emptyMessage = "Nenhum acontecimento encontrado com esses filtros.",
  detailParams,
}: Props) {
  if (!rows.length) {
    return (
      <section className={styles.empty}>
        <span>SEM RESULTADOS</span>
        <h2>Nada encontrado</h2>
        <p>{emptyMessage}</p>
      </section>
    );
  }

  return (
    <div className={styles.list}>
      {rows.map((event) =>
        isProcessing(event) ? (
          <article key={`analysis-${event.analysisJobId}`} className={styles.card}>
            <CardContents event={event} timezone={timezone} />
          </article>
        ) : (
          <Link
            key={event.id}
            href={detailHref(event.id, detailParams)}
            prefetch={false}
            className={styles.card}
          >
            <CardContents event={event} timezone={timezone} />
          </Link>
        ),
      )}
    </div>
  );
}
