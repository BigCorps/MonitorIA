import Link from "next/link";
import type { SearchEventRow } from "@/src/lib/event-search-data";
import {
  eventTypeLabel,
  reviewLabel,
} from "@/src/lib/event-labels";
import styles from "./events.module.css";

type Props = {
  rows: SearchEventRow[];
  timezone?: string;
  emptyMessage?: string;
};

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function durationLabel(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`;
}

export function EventList({
  rows,
  timezone = "America/Sao_Paulo",
  emptyMessage = "Nenhum evento encontrado com esses filtros.",
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
          href={`/dashboard/events/${event.id}`}
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

            <span>
              {Math.round(event.confidence * 100)}%
            </span>
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
                {formatDate(event.startedAt, timezone)}
              </time>
            </div>

            <p>{event.summary}</p>

            <div className={styles.meta}>
              <span>{eventTypeLabel(event.eventType)}</span>
              <span>◎ {event.peopleCount} pessoas</span>
              <span>◇ {event.vehicleCount} veículos</span>
              <span>◷ {durationLabel(event.durationSeconds)}</span>
              <span
                data-state={
                  event.humanVerdict ??
                  (event.requiresReview ? "pending" : "ok")
                }
              >
                {event.humanVerdict
                  ? reviewLabel(event.humanVerdict)
                  : event.requiresReview
                    ? "Revisão pendente"
                    : "Sem revisão"}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
