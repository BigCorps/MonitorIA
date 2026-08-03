"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./processes.module.css";

type Props = {
  organizationId: string;
};

type LiveState = "connecting" | "live" | "updating" | "offline";

export function ProcessesRealtimeRefresh({ organizationId }: Props) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<LiveState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      setState("updating");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        router.refresh();
        setState("live");
      }, 1200);
    };

    const channel = supabase
      .channel(`monitoria-processes-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_process_instances",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_process_deviations",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setState("live");
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setState("offline");
        }
      });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const labels: Record<LiveState, string> = {
    connecting: "Conectando…",
    live: "Ao vivo",
    updating: "Atualizando…",
    offline: "Atualizar",
  };

  return (
    <button
      type="button"
      className={`${styles.liveButton} ${styles[state]}`}
      onClick={() => router.refresh()}
      title="Atualizar processos operacionais"
    >
      <span aria-hidden="true" />
      {labels[state]}
    </button>
  );
}
