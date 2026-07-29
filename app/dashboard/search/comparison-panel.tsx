import type {
  PeriodComparison,
  PeriodMetrics,
} from "@/src/lib/event-search-data";
import { eventTypeLabel } from "@/src/lib/event-labels";
import styles from "./search.module.css";

function variation(current: number, previous: number) {
  if (previous === 0) {
    return current === 0 ? "0%" : "novo";
  }

  const value = ((current - previous) / previous) * 100;
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function Metric({
  label,
  a,
  b,
}: {
  label: string;
  a: number;
  b: number;
}) {
  return (
    <article className={styles.comparisonMetric}>
      <span>{label}</span>
      <strong>{a}</strong>
      <small>
        Período B: {b} · {variation(a, b)}
      </small>
    </article>
  );
}

function TypeList({
  metrics,
}: {
  metrics: PeriodMetrics;
}) {
  const entries = Object.entries(metrics.byType ?? {})
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8);

  return (
    <div className={styles.typeList}>
      {entries.length ? (
        entries.map(([type, count]) => (
          <div key={type}>
            <span>{eventTypeLabel(type)}</span>
            <strong>{count}</strong>
          </div>
        ))
      ) : (
        <p>Nenhum evento no período.</p>
      )}
    </div>
  );
}

export function ComparisonPanel({
  comparison,
}: {
  comparison: PeriodComparison;
}) {
  const a = comparison.periodA;
  const b = comparison.periodB;

  return (
    <section className={styles.comparisonPanel}>
      <div className={styles.comparisonHeading}>
        <div>
          <span>COMPARAÇÃO DETERMINÍSTICA</span>
          <h2>Período A versus período B</h2>
        </div>
        <small>
          Calculado diretamente no banco, sem consumir IA.
        </small>
      </div>

      <div className={styles.comparisonMetrics}>
        <Metric
          label="Eventos"
          a={Number(a.totalEvents ?? 0)}
          b={Number(b.totalEvents ?? 0)}
        />
        <Metric
          label="Com pessoas"
          a={Number(a.peopleEvents ?? 0)}
          b={Number(b.peopleEvents ?? 0)}
        />
        <Metric
          label="Com veículos"
          a={Number(a.vehicleEvents ?? 0)}
          b={Number(b.vehicleEvents ?? 0)}
        />
        <Metric
          label="Exigem revisão"
          a={Number(a.reviewRequired ?? 0)}
          b={Number(b.reviewRequired ?? 0)}
        />
        <Metric
          label="Já revisados"
          a={Number(a.reviewedEvents ?? 0)}
          b={Number(b.reviewedEvents ?? 0)}
        />
        <article className={styles.comparisonMetric}>
          <span>Confiança média</span>
          <strong>
            {Math.round(Number(a.averageConfidence ?? 0) * 100)}%
          </strong>
          <small>
            Período B:{" "}
            {Math.round(Number(b.averageConfidence ?? 0) * 100)}%
          </small>
        </article>
      </div>

      <div className={styles.typeColumns}>
        <div>
          <h3>Tipos no período A</h3>
          <TypeList metrics={a} />
        </div>
        <div>
          <h3>Tipos no período B</h3>
          <TypeList metrics={b} />
        </div>
      </div>
    </section>
  );
}
