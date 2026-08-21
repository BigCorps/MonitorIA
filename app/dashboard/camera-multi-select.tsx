"use client";

import { useMemo, useState } from "react";
import styles from "./camera-multi-select.module.css";

type CameraOption = {
  id: string;
  name: string;
};

type Props = {
  cameras: CameraOption[];
  selectedIds: string[];
  name?: string;
  label?: string;
};

export function CameraMultiSelect({
  cameras,
  selectedIds,
  name = "cameras",
  label = "Câmeras",
}: Props) {
  const [selected, setSelected] = useState<string[]>(
    selectedIds.length === cameras.length ? [] : selectedIds,
  );

  const summary = useMemo(() => {
    if (!selected.length || selected.length === cameras.length) {
      return "Todas as câmeras";
    }

    const names = cameras
      .filter((camera) => selected.includes(camera.id))
      .map((camera) => camera.name);

    if (names.length <= 2) return names.join(" + ");
    return `${names.length} câmeras`;
  }, [cameras, selected]);

  function toggle(cameraId: string) {
    setSelected((current) => {
      const next = !current.length
        ? cameras.map((camera) => camera.id).filter((id) => id !== cameraId)
        : current.includes(cameraId)
          ? current.filter((id) => id !== cameraId)
          : [...current, cameraId];

      if (!next.length || next.length === cameras.length) return [];
      return next;
    });
  }

  return (
    <div className={styles.field}>
      <span>{label}</span>
      <input type="hidden" name={name} value={selected.join(",")} />
      <details className={styles.picker}>
        <summary>
          <strong>{summary}</strong>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className={styles.menu}>
          <button
            type="button"
            className={styles.allButton}
            onClick={() => setSelected([])}
            data-active={selected.length === 0}
          >
            Todas as câmeras
          </button>

          <div className={styles.options}>
            {cameras.map((camera) => {
              const checked =
                selected.length === 0 || selected.includes(camera.id);

              return (
                <label key={camera.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(camera.id)}
                  />
                  <span>{camera.name}</span>
                </label>
              );
            })}
          </div>

          <small>
            Selecione uma ou mais câmeras. “Todas” mantém a visão consolidada.
          </small>
        </div>
      </details>
    </div>
  );
}
