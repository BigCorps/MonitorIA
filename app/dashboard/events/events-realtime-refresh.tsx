"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./events-realtime-refresh.module.css";

type Props = { organizationId: string };
type RealtimeState = "connecting" | "live" | "updating" | "offline";
const REFRESH_DEBOUNCE_MS = 1400;
const PENDING_POLL_MS = 8_000;

export function EventsRealtimeRefresh({ organizationId }: Props) {
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
      }, REFRESH_DEBOUNCE_MS);
    }

    const channel = supabase
      .channel(`events-timeline:${organizationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "events",
        filter: `organization_id=eq.${organizationId}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "events",
        filter: `organization_id=eq.${organizationId}`,
      }, refreshSoon)
      .subscribe((status: string) => {
        if (!active) return;
        if (status === "SUBSCRIBED") return void setState("live");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setState("offline");
      });

    // O INSERT de analysis_jobs é service-role e nem toda configuração de
    // Realtime o publica para o cliente. Poll leve garante que o card
    // "Analisando…" apareça antes da conclusão e também cobre uma queda do WS.
    const pendingPoll = window.setInterval(() => {
      if (!active || document.visibilityState !== "visible") return;
      router.refresh();
    }, PENDING_POLL_MS);

    const onVisibility = () => {
      if (active && document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.clearInterval(pendingPoll);
      document.removeEventListener("visibilitychange", onVisibility);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const label = state === "live"
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
      title={state === "offline"
        ? "Clique para atualizar a linha do tempo"
        : "A linha do tempo acompanha recebimento e conclusão das análises"}
    >
      <span aria-hidden="true" />
      {label}
    </button>
  );
}
