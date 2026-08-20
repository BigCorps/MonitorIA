import type { ReactNode } from "react";
import styles from "./monitoring-analysis-details.module.css";

type Props = {
  children: ReactNode;
  title?: string;
  description?: string;
  open?: boolean;
  className?: string;
};

export function MonitoringAnalysisDetails({
  children,
  title = "Detalhes da análise",
  description = "Informações adicionais sobre como este resultado foi interpretado.",
  open = false,
  className = "",
}: Props) {
  return (
    <details
      className={[styles.details, className].filter(Boolean).join(" ")}
      open={open}
    >
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className={styles.content}>{children}</div>
    </details>
  );
}
