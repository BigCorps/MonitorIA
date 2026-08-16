"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./sales-trial.module.css";

export type SalesCameraOption = {
  id: string;
  name: string;
  siteName: string;
  description: string;
  ready: boolean;
  reasons: string[];
};

type Props = {
  cameras: SalesCameraOption[];
  selectedIds: string[];
  maxCameras: number;
};

export function SalesCameraSelection({
  cameras,
  selectedIds,
  maxCameras,
}: Props) {
  const initial = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [selected, setSelected] = useState(initial);

  useEffect(() => {
    setSelected(new Set(selectedIds));
  }, [selectedIds]);

  function toggle(cameraId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(cameraId)) {
        next.delete(cameraId);
      } else if (next.size < maxCameras) {
        next.add(cameraId);
      }
      return next;
    });
  }

  return (
    <>
      <div className={styles.selectionSummary}>
        <strong>{selected.size} de {maxCameras}</strong>
        <span>câmeras selecionadas</span>
      </div>

      <div className={styles.cameraGrid}>
        {cameras.map((camera) => {
          const checked = selected.has(camera.id);
          const limitReached = selected.size >= maxCameras && !checked;
          const inputId = `sales-camera-${camera.id}`;

          return (
            <label
              className={`${styles.cameraCard} ${checked ? styles.cameraSelected : ""} ${limitReached ? styles.cameraDisabled : ""}`}
              htmlFor={inputId}
              key={camera.id}
            >
              <input
                id={inputId}
                type="checkbox"
                name="camera_id"
                value={camera.id}
                checked={checked}
                disabled={limitReached}
                onChange={() => toggle(camera.id)}
              />
              <span className={styles.selectionMark} aria-hidden="true">
                {checked ? "✓" : ""}
              </span>
              <div className={styles.cameraInfo}>
                <span>{camera.siteName}</span>
                <strong>{camera.name}</strong>
                <small>{camera.description || "Câmera monitorada"}</small>
              </div>
              <span className={camera.ready ? styles.readyBadge : styles.pendingBadge}>
                {camera.ready ? "Pronta" : "Com pendências"}
              </span>
            </label>
          );
        })}
      </div>
    </>
  );
}
