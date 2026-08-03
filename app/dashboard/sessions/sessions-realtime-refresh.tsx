"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./sessions.module.css";

type Props = {
  organizationId: string;
};

type RealtimeState = "connecting" | "live" | "updating" | "offline";

export function SessionsRealtimeRefresh({ organizationId }: Props) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<RealtimeState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    function refreshSoon() {
      if (!active) return;
      setState("updating");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!active) return;
        router.refresh();
        timerRef.current = setTimeout(() => {
          if (active) setState("live");
        }, 450);
      }, 1400);
    }

    const channel = supabase
      .channel(`operational-sessions:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "operational_sessions",
          filter: `organization_id=eq.${organizationId}`,
        },
        refreshSoon,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "operational_sessions",
          filter: `organization_id=eq.${organizationId}`,
        },
        refreshSoon,
      )
      .subscribe((status: string) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          setState("live");
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setState("offline");
        }
      });

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const label =
    state === "live"
      ? "Ao vivo"
      : state === "updating"
        ? "Atualizando"
        : state === "offline"
          ? "Reconectar"
          : "Conectando";

  return (
    <button
      type="button"
      className={styles.liveStatus}
      data-state={state}
      onClick={() => {
        setState("updating");
        router.refresh();
        window.setTimeout(() => setState("live"), 450);
      }}
    >
      <span aria-hidden="true" />
      {label}
    </button>
  );
}
