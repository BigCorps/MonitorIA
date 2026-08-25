"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./events-realtime-refresh.module.css";

type Props = {
  organizationId: string;
  autoDateRange?: boolean;
  automaticFromDate: string;
  automaticToDate: string;
};
type RealtimeState = "connecting" | "live" | "updating" | "offline";
const REFRESH_DEBOUNCE_MS = 1400;
const SAFETY_POLL_MS = 60_000;

export function EventsRealtimeRefresh({
  organizationId,
  autoDateRange = false,
  automaticFromDate,
  automaticToDate,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<RealtimeState>("connecting");

  useEffect(() => {
    const form = document.getElementById("events-filter-form") as HTMLFormElement | null;
    if (!form) return;

    const fromInput = form.elements.namedItem("from") as HTMLInputElement | null;
    const toInput = form.elements.namedItem("to") as HTMLInputElement | null;
    const rangeInput = form.elements.namedItem("range") as HTMLInputElement | null;
    if (!fromInput || !toInput || !rangeInput) return;

    const syncRangeMode = () => {
      rangeInput.value =
        fromInput.value === automaticFromDate && toInput.value === automaticToDate
          ? "auto"
          : "custom";
    };

    fromInput.addEventListener("change", syncRangeMode);
    toInput.addEventListener("change", syncRangeMode);
    syncRangeMode();

    return () => {
      fromInput.removeEventListener("change", syncRangeMode);
      toInput.removeEventListener("change", syncRangeMode);
    };
  }, [automaticFromDate, automaticToDate]);

  useEffect(() => {
    if (!autoDateRange) return;
    if (!searchParams.has("from") && !searchParams.has("to")) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    params.delete("range");
    params.delete("page");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [autoDateRange, pathname, router, searchParams]);

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
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
          setState("offline");
        }
      });

    // Realtime é a via principal. Este poll é apenas uma rede de segurança
    // para uma aba que perdeu uma mensagem do canal. O poll antigo de 8 s
    // fazia refresh constante mesmo sem nada pendente e rearmava prefetches
    // de dezenas de cards.
    const safetyPoll = window.setInterval(() => {
      if (!active || document.visibilityState !== "visible") return;
      router.refresh();
    }, SAFETY_POLL_MS);

    const onVisibility = () => {
      if (active && document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      window.clearInterval(safetyPoll);
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
