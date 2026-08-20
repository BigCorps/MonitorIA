import Link from "next/link";
import type { OperationalSessionRow } from "@/src/lib/operational-session-data";
import {
  operationalSessionOutcomeLabel,
  operationalSessionStatusLabel,
  operationalSessionTypeLabel,
} from "@/src/lib/operational-session-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringDuration,
} from "@/src/lib/monitoring-display";
import styles from "./sessions.module.css";

type Props = {
  rows: OperationalSessionRow[];
  timezone: string;
};

function countLabel(
  count: number,
  singular: string,
  pluralValue: string,
) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

export function SessionList({ rows, timezone }: Props) {
  if (!rows.length) {
    return (
      <section className={styles.empty}>
        <span>SEM PERÍODOS</span>
        <h2>Nenhuma atividade agrupada encontrada</h2>
        <p>
          Quando acontecimentos relacionados ocorrerem em sequência, eles
          aparecerão aqui como um único período.
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
          </div>

          <div className={styles.cardBody}>
            <div className={styles.cardHeading}>
              <div>
                <span>
                  {session.siteName} · {session.cameraName}
                </span>
                <h2>{session.title}</h2>
              </div>
              <time>
                {formatMonitoringDateTime(
                  session.startedAt,
                  session.timezone || timezone,
                )}
              </time>
            </div>

            <p>{session.summary}</p>

            <div className={styles.meta}>
              <span>
                {operationalSessionTypeLabel(session.sessionType)}
              </span>
              <span data-state={session.status}>
                {operationalSessionStatusLabel(session.status)}
              </span>
              <span>
                {countLabel(
                  session.chapterCount,
                  "registro",
                  "registros",
                )}
              </span>
              {session.probableCustomerCount > 0 ? (
                <span>
                  ≈{" "}
                  {countLabel(
                    session.probableCustomerCount,
                    "cliente/visitante",
                    "clientes/visitantes",
                  )}
                </span>
              ) : null}
              {session.probableStaffCount > 0 ? (
                <span>
                  ◎{" "}
                  {countLabel(
                    session.probableStaffCount,
                    "pessoa da equipe",
                    "pessoas da equipe",
                  )}
                </span>
              ) : null}
              <span>
                ◷ {formatMonitoringDuration(session.durationSeconds)}
              </span>
              {session.outcomeCode !== "in_progress" &&
              session.outcomeCode !== "no_visible_outcome" ? (
                <span>
                  {operationalSessionOutcomeLabel(session.outcomeCode)}
                </span>
              ) : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
