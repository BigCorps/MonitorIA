"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./events-realtime-refresh.module.css";

type Props = {
  organizationId: string;
};

type RealtimeState =
  | "connecting"
  | "live"
  | "updating"
  | "offline";

const REFRESH_DEBOUNCE_MS = 1400;

export function EventsRealtimeRefresh({
  organizationId,
}: Props) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [state, setState] =
    useState<RealtimeState>("connecting");

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    function scheduleRefresh() {
      if (!active) return;

      setState("updating");

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        if (!active) return;

        router.refresh();

        timerRef.current = setTimeout(() => {
          if (active) setState("live");
        }, 450);
      }, REFRESH_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`events-timeline:${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      )
      .subscribe((status) => {
        if (!active) return;

        if (status === "SUBSCRIBED") {
          setState("live");
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setState("offline");
        }
      });

    return () => {
      active = false;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

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
      className={styles.status}
      data-state={state}
      onClick={() => {
        setState("updating");
        router.refresh();
        window.setTimeout(() => setState("live"), 450);
      }}
      title={
        state === "offline"
          ? "Clique para atualizar a linha do tempo"
          : "A linha do tempo atualiza quando novos eventos chegam"
      }
    >
      <span aria-hidden="true" />
      {label}
    </button>
  );
}
