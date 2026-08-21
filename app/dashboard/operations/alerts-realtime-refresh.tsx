"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./alerts.module.css";

export function AlertsRealtimeRefresh({
  organizationId,
}: {
  organizationId: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<
    "connecting" | "live" | "updating" | "offline"
  >("connecting");

  useEffect(() => {
    const supabase = createClient();

    const refresh = () => {
      setStatus("updating");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setStatus("live");
      }, 700);
    };

    const channel = supabase
      .channel(`operations-alerts-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "operational_alerts",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "intelligent_alerts",
          filter: `organization_id=eq.${organizationId}`,
        },
        refresh,
      )
      .subscribe((next: string) => {
        if (next === "SUBSCRIBED") setStatus("live");
        else if (next === "CHANNEL_ERROR") setStatus("offline");
        else setStatus("connecting");
      });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  const label =
    status === "live"
      ? "Ao vivo"
      : status === "updating"
        ? "Atualizando"
        : status === "offline"
          ? "Sem atualização ao vivo"
          : "Conectando";

  return (
    <span className={`${styles.realtime} ${styles[status]}`}>{label}</span>
  );
}
