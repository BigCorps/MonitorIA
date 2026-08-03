"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  formatCountdown,
  secondsUntil,
} from "@/src/trial/status";
import styles from "./trial.module.css";

type Props = {
  target: string;
  label: string;
  compact?: boolean;
};

export function TrialCountdown({ target, label, compact }: Props) {
  const router = useRouter();
  const initial = useMemo(() => secondsUntil(target), [target]);
  const [seconds, setSeconds] = useState(initial);

  useEffect(() => {
    setSeconds(secondsUntil(target));

    const timer = window.setInterval(() => {
      const next = secondsUntil(target);
      setSeconds(next);

      if (next === 0) {
        window.clearInterval(timer);
        window.setTimeout(() => router.refresh(), 900);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [router, target]);

  return (
    <div
      className={
        compact
          ? styles.countdownCompact
          : styles.countdown
      }
      aria-live="polite"
    >
      <span>{label}</span>
      <strong>{formatCountdown(seconds)}</strong>
    </div>
  );
}
