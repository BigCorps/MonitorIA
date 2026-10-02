import Link from "next/link";
import type { CameraRecoveryCamera } from "@/src/lib/camera-recovery-data";
import styles from "./camera-recovery-panel.module.css";

function byteLabel(value: number | null) {
  if (value === null) return null;
  const gib = value / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(gib >= 10 ? 0 : 1)} GB livres`;
  const mib = value / 1024 / 1024;
  return `${Math.max(0, Math.round(mib))} MB livres`;
}

export function CameraRecoveryPanel({
  camera,
  variant,
  refreshHref,
  open = false,
}: {
  camera: CameraRecoveryCamera;
  variant: "standard" | "vip";
  refreshHref: string;
  open?: boolean;
}) {
  const diagnosis = camera.diagnosis;
  const disk = byteLabel(camera.agentDiskFreeBytes);

  return (
    <details
      className={styles.panel}
      data-variant={variant}
      data-tone={diagnosis.tone}
      open={open}
    >
      <summary>
        <span>Ver diagnóstico avançado</span>
        <b>{diagnosis.areaLabel}</b>
      </summary>

      <div className={styles.body}>
        <header className={styles.header}>
          <span>CAUSA PROVÁVEL · {diagnosis.areaLabel.toUpperCase()}</span>
          <h4>{diagnosis.title}</h4>
          <p>{diagnosis.summary}</p>
        </header>

        {diagnosis.inconsistencies.length ? (
          <div className={styles.inconsistency}>
            <strong>Estado inconsistente detectado</strong>
            <ul>
              {diagnosis.inconsistencies.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <small>
              O MonitorIA mostra a divergência em vez de alterar o cadastro ou
              fingir que a câmera voltou a funcionar.
            </small>
          </div>
        ) : null}

        <div className={styles.signals} aria-label="Sinais usados no diagnóstico">
          {diagnosis.signals.map((signal) => (
            <div key={signal.key} data-tone={signal.tone}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>

        {disk ? (
          <p className={styles.disk}>
            Espaço livre informado pelo computador: <strong>{disk}</strong>.
          </p>
        ) : null}

        {diagnosis.automaticRecovery ? (
          <div className={styles.automatic}>
            <strong>O que o MonitorIA já tenta sozinho</strong>
            <p>{diagnosis.automaticRecovery}</p>
          </div>
        ) : null}

        <div className={styles.recovery}>
          <strong>Recuperação assistida</strong>
          <p>
            Execute somente a ação indicada abaixo. Este Gate não reinicia o
            Agent, não troca RTSP e não modifica parâmetros da câmera
            automaticamente.
          </p>

          <div className={styles.actions}>
            {diagnosis.primaryAction ? (
              <Link data-primary="true" href={diagnosis.primaryAction.href}>
                {diagnosis.primaryAction.label}
              </Link>
            ) : null}
            {diagnosis.secondaryAction ? (
              <Link href={diagnosis.secondaryAction.href}>
                {diagnosis.secondaryAction.label}
              </Link>
            ) : null}
            <Link href={refreshHref}>Verificar novamente</Link>
            {diagnosis.issue !== "healthy" && diagnosis.issue !== "recording_ready" ? (
              <Link href="/dashboard/support">Abrir suporte</Link>
            ) : null}
          </div>
        </div>
      </div>
    </details>
  );
}
