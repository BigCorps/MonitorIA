"use client";

import { useState } from "react";
import styles from "./event-detail.module.css";

type ImageAsset = {
  id: string;
  label: string;
  capturedAt: string | null;
};

type ClipAsset = {
  id: string;
  byteSize: number | null;
};

type Props = {
  invoiceSafeTitle: string;
  images: ImageAsset[];
  clip: ClipAsset | null;
  expectedEvidenceCount: number;
  timezone: string;
};

function bytesLabel(value: number | null) {
  if (!value) return null;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function durationLabel(value: number | null) {
  if (!value || !Number.isFinite(value)) return null;
  const seconds = Math.max(0, Math.round(value));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;
}

export function EventMedia({
  invoiceSafeTitle,
  images,
  clip,
  expectedEvidenceCount,
  timezone,
}: Props) {
  const [tab, setTab] = useState<"images" | "clip">("images");
  const [clipDurationSeconds, setClipDurationSeconds] = useState<number | null>(null);

  const frameLabel = (value: string) => {
    const labels: Record<string, string> = {
      start: "Início",
      peak: "Pico",
      end: "Fim",
      extra: "Intermediário",
    };
    return labels[value] ?? value;
  };

  const formatCapturedAt = (value: string) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
      timeZone: timezone,
    }).format(new Date(value));

  return (
    <div>
      <div className={styles.mediaTabs}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "images"}
          className={tab === "images" ? styles.mediaTabActive : ""}
          onClick={() => setTab("images")}
        >
          Imagens ({images.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "clip"}
          className={tab === "clip" ? styles.mediaTabActive : ""}
          onClick={() => setTab("clip")}
          disabled={!clip}
          title={
            clip
              ? "Reproduzir clipe"
              : "Clipe indisponível para este acontecimento"
          }
        >
          Clipe
        </button>
      </div>

      {tab === "clip" && clip ? (
        <div className={styles.clipPanel}>
          <video
            controls
            preload="metadata"
            playsInline
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              setClipDurationSeconds(
                Number.isFinite(duration) && duration > 0 ? duration : null,
              );
            }}
            poster={
              images[0]
                ? `/api/storage-assets/${images[0].id}`
                : undefined
            }
          >
            <source
              src={`/api/storage-assets/${clip.id}`}
              type="video/mp4"
            />
            Seu navegador não conseguiu reproduzir este clipe.
          </video>
          <div className={styles.clipMeta}>
            <strong>Trecho do acontecimento</strong>
            <span>
              720p · H.264 · sem áudio
              {durationLabel(clipDurationSeconds)
                ? ` · ${durationLabel(clipDurationSeconds)}`
                : ""}
              {bytesLabel(clip.byteSize)
                ? ` · ${bytesLabel(clip.byteSize)}`
                : ""}
            </span>
          </div>
        </div>
      ) : images.length ? (
        <>
          {images.length < expectedEvidenceCount ? (
            <div className={styles.evidenceNotice}>
              Este acontecimento possui {images.length} de{" "}
              {expectedEvidenceCount} imagens previstas para o modo
              utilizado. Eventos anteriores à atualização do Agent não
              recebem quadros retroativamente.
            </div>
          ) : null}

          <div className={styles.frames}>
            {images.map((asset) => (
              <figure key={asset.id}>
                <img
                  src={`/api/storage-assets/${asset.id}`}
                  alt={`${invoiceSafeTitle}: quadro ${frameLabel(
                    asset.label,
                  )}`}
                />
                <figcaption>
                  <strong>{frameLabel(asset.label)}</strong>
                  <span>
                    {asset.capturedAt
                      ? formatCapturedAt(asset.capturedAt)
                      : "Horário indisponível"}
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className={styles.emptyBlock}>
          Nenhuma imagem disponível para este acontecimento.
        </div>
      )}
    </div>
  );
}
