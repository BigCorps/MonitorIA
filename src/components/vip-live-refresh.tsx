"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function VipLiveRefresh({
  intervalMs = 10_000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    let timer: number | null = null;

    const refresh = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    const schedule = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
      if (document.visibilityState === "visible") {
        timer = window.setInterval(refresh, intervalMs);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
      schedule();
    };

    const onFocus = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    schedule();

    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [intervalMs, router]);

  return null;
}
