"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./routines.module.css";

type LiveState = "connecting" | "live" | "updating" | "offline";

export function RoutinesRealtimeRefresh({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<LiveState>("connecting");

  useEffect(() => {
    const supabase = createClient();

    const scheduleRefresh = () => {
      setState("updating");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
        setState("live");
      }, 1200);
    };

    const channel = supabase
      .channel(`routine-intelligence-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "camera_behavior_baselines",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_deviations",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_insights",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setState("live");
        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setState("offline");
        }
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const label = {
    connecting: "Conectando",
    live: "Ao vivo",
    updating: "Atualizando",
    offline: "Atualizar",
  }[state];

  return (
    <button
      type="button"
      className={styles.liveStatus}
      data-state={state}
      onClick={() => {
        setState("updating");
        router.refresh();
        window.setTimeout(() => setState("live"), 500);
      }}
      aria-label="Atualizar rotinas e desvios"
    >
      <span aria-hidden="true" />
      {label}
    </button>
  );
}
