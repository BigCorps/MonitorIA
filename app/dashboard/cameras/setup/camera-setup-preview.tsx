"use client";

import { useEffect, useState } from "react";
import styles from "./setup.module.css";

type Props = {
  cameraId: string;
  cameraName: string;
};

export function CameraSetupPreview({ cameraId, cameraName }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const timer = window.setTimeout(() => {
      setAttempt((value) => value + 1);
    }, 5_000);
    return () => window.clearTimeout(timer);
  }, [loaded, attempt]);

  return (
    <div className={styles.preview} data-loaded={loaded}>
      <div className={styles.previewPlaceholder}>
        <span className={styles.previewSpinner} aria-hidden="true" />
        <strong>Aguardando a primeira imagem</strong>
        <small>
          Assim que o Agent enviar um frame, ele aparece aqui automaticamente.
        </small>
      </div>

      <img
        key={attempt}
        src={`/api/cameras/${cameraId}/first-frame?v=${attempt}`}
        alt={`Primeira imagem captada por ${cameraName}`}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(false)}
      />

      {loaded ? (
        <span className={styles.previewCaption}>Primeira imagem captada</span>
      ) : null}
    </div>
  );
}
