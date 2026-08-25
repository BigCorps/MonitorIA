"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./events.module.css";

const RETRY_DELAYS_MS = [350, 1500] as const;

type Props = {
  assetId: string;
  alt?: string;
};

export function EventThumbnailImage({ assetId, alt = "" }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [unavailable, setUnavailable] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setAttempt(0);
    setUnavailable(false);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [assetId]);

  if (unavailable) {
    return (
      <img
        className={styles.fallbackLogo}
        src="/favicon.svg"
        alt=""
        title="Imagem temporariamente indisponível"
      />
    );
  }

  const suffix = attempt > 0 ? `?retry=${attempt}` : "";

  return (
    <img
      key={`${assetId}-${attempt}`}
      src={`/api/storage-assets/${assetId}${suffix}`}
      alt={alt}
      onError={() => {
        if (timerRef.current) return;

        const delay = RETRY_DELAYS_MS[attempt];
        if (delay === undefined) {
          setUnavailable(true);
          return;
        }

        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setAttempt((current) => current + 1);
        }, delay);
      }}
    />
  );
}
