import Link from "next/link";
import type { SearchEventRow } from "@/src/lib/event-search-data";
import { eventTypeLabel } from "@/src/lib/event-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringDuration,
} from "@/src/lib/monitoring-display";
import styles from "./events.module.css";

type Props = {
  rows: SearchEventRow[];
  timezone?: string;
  emptyMessage?: string;
  detailParams?: Record<string, string>;
};

function detailHref(
  eventId: string,
  detailParams: Record<string, string> | undefined,
) {
  const query = new URLSearchParams(detailParams);
  const suffix = query.toString();
  return `/dashboard/events/${eventId}${suffix ? `?${suffix}` : ""}`;
}

function countLabel(
  count: number,
  singular: string,
  plural: string,
) {
  return `${count} ${count === 1 ? singular : plural}`;
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
      {rows.map((event) => (
        <Link
          key={event.id}
          href={detailHref(event.id, detailParams)}
          className={styles.card}
        >
          <div className={styles.thumbnail}>
            {event.thumbnailAssetId ? (
              <img
                src={`/api/storage-assets/${event.thumbnailAssetId}`}
                alt=""
              />
            ) : (
              <img
                className={styles.fallbackLogo}
                src="/favicon.svg"
                alt=""
              />
            )}

            {event.requiresReview && !event.humanVerdict ? (
              <span data-kind="review">Revisar</span>
            ) : event.humanVerdict === "irrelevant" ? (
              <span data-kind="irrelevant">Irrelevante</span>
            ) : null}
          </div>

          <div className={styles.cardBody}>
            <div className={styles.cardHeading}>
              <div>
                <span>
                  {event.siteName} · {event.cameraName}
                </span>
                <h2>{event.headline}</h2>
              </div>

              <time>
                {formatMonitoringDateTime(event.startedAt, timezone)}
              </time>
            </div>

            <p>{event.summary}</p>

            <div className={styles.meta}>
              <span>{eventTypeLabel(event.eventType)}</span>
              <span>
                ◎ {countLabel(event.peopleCount, "pessoa", "pessoas")}
              </span>
              <span>
                ◇ {countLabel(event.vehicleCount, "veículo", "veículos")}
              </span>
              {event.probableCustomerCount > 0 ? (
                <span>
                  ≈ {countLabel(
                    event.probableCustomerCount,
                    "cliente provável",
                    "clientes prováveis",
                  )}
                </span>
              ) : null}
              <span>
                ◷ {formatMonitoringDuration(event.durationSeconds)}
              </span>
              {event.requiresReview && !event.humanVerdict ? (
                <span data-state="pending">Revisão recomendada</span>
              ) : null}
              {event.humanVerdict === "irrelevant" ? (
                <span data-state="irrelevant">Marcado como irrelevante</span>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
