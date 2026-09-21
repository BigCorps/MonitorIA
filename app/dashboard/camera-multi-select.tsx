"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSourceContext } from "./dashboard-source-context";
import {
  allSourcesLabel,
  sourceCollectionLabel,
} from "@/src/lib/source-mode";
import styles from "./camera-multi-select.module.css";

type CameraOption = {
  id: string;
  name: string;
  sourceKind?: "live_camera" | "local_recording";
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
  label,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { mode } = useDashboardSourceContext();
  const collectionLabel = sourceCollectionLabel(mode);
  const allLabel = allSourcesLabel(mode);
  const effectiveLabel = label ?? collectionLabel;

  const [selected, setSelected] = useState<string[]>(
    selectedIds.length === cameras.length ? [] : selectedIds,
  );

  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px)");

    const syncOuterDisclosure = () => {
      const disclosure = rootRef.current?.closest("details");
      if (!disclosure) return;
      disclosure.open = media.matches;
    };

    syncOuterDisclosure();
    media.addEventListener("change", syncOuterDisclosure);

    return () => {
      media.removeEventListener("change", syncOuterDisclosure);
    };
  }, []);

  const summary = useMemo(() => {
    if (!selected.length || selected.length === cameras.length) {
      return allLabel;
    }

    const names = cameras
      .filter((camera) => selected.includes(camera.id))
      .map((camera) => camera.name);

    if (names.length <= 2) return names.join(" + ");
    return `${names.length} ${collectionLabel.toLowerCase()}`;
  }, [allLabel, cameras, collectionLabel, selected]);

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
    <div ref={rootRef} className={styles.field}>
      <span>{effectiveLabel}</span>
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
            {allLabel}
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
                  <span>
                    {camera.name}
                    {mode === "hybrid" && camera.sourceKind ? (
                      <small>
                        {" · "}
                        {camera.sourceKind === "local_recording"
                          ? "Gravações"
                          : "Câmera conectada"}
                      </small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          <small>
            {mode === "recordings_only"
              ? "Selecione um ou mais ambientes. “Todos” mantém a visão consolidada."
              : mode === "hybrid"
                ? "Selecione uma ou mais fontes. “Todas” reúne câmeras conectadas e gravações."
                : "Selecione uma ou mais câmeras. “Todas” mantém a visão consolidada."}
          </small>
        </div>
      </details>
    </div>
  );
}
