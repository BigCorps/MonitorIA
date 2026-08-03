import Link from "next/link";
import type { OperationalSessionRow } from "@/src/lib/operational-session-data";
import {
  operationalSessionOutcomeLabel,
  operationalSessionStatusLabel,
  operationalSessionTypeLabel,
} from "@/src/lib/operational-session-labels";
import styles from "./sessions.module.css";

type Props = {
  rows: OperationalSessionRow[];
  timezone: string;
};

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function durationLabel(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded}s`;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secondsLeft = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return secondsLeft ? `${minutes}m ${secondsLeft}s` : `${minutes}m`;
}

export function SessionList({ rows, timezone }: Props) {
  if (!rows.length) {
    return (
      <section className={styles.empty}>
        <span>SEM SESSÕES</span>
        <h2>Nenhuma história operacional encontrada</h2>
        <p>
          As sessões aparecerão quando novos eventos forem relacionados pela
          memória curta.
        </p>
      </section>
    );
  }

  return (
    <div className={styles.list}>
      {rows.map((session) => (
        <Link
          key={session.id}
          href={`/dashboard/sessions/${session.id}`}
          className={styles.card}
        >
          <div className={styles.thumbnail}>
            {session.thumbnailAssetId ? (
              <img
                src={`/api/storage-assets/${session.thumbnailAssetId}`}
                alt=""
              />
            ) : (
              <img
                className={styles.fallbackLogo}
                src="/favicon.svg"
                alt=""
              />
            )}
            <span>{Math.round(session.confidence * 100)}%</span>
          </div>

          <div className={styles.cardBody}>
            <div className={styles.cardHeading}>
              <div>
                <span>
                  {session.siteName} · {session.cameraName}
                </span>
                <h2>{session.title}</h2>
              </div>
              <time>{formatDate(session.startedAt, timezone)}</time>
            </div>

            <p>{session.summary}</p>

            <div className={styles.meta}>
              <span>{operationalSessionTypeLabel(session.sessionType)}</span>
              <span data-state={session.status}>
                {operationalSessionStatusLabel(session.status)}
              </span>
              <span>↻ {session.chapterCount} capítulos</span>
              <span>≈ {session.probableCustomerCount} cliente(s)</span>
              <span>◎ {session.probableStaffCount} funcionário(s)</span>
              <span>◷ {durationLabel(session.durationSeconds)}</span>
              {session.outcomeCode !== "in_progress" ? (
                <span>{operationalSessionOutcomeLabel(session.outcomeCode)}</span>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
