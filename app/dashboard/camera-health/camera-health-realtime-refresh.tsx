"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./camera-health.module.css";

export default function CameraHealthRealtimeRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      setStatus("updating");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { router.refresh(); setStatus("live"); }, 900);
    };
    const channel = supabase.channel(`camera-health-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "camera_health_incidents", filter: `organization_id=eq.${organizationId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "camera_health_baselines", filter: `organization_id=eq.${organizationId}` }, refresh)
      .subscribe((next: string) => setStatus(next === "SUBSCRIBED" ? "live" : next === "CHANNEL_ERROR" ? "offline" : "connecting"));
    return () => { if (timer.current) clearTimeout(timer.current); void supabase.removeChannel(channel); };
  }, [organizationId, router]);

  return <span className={`${styles.realtime} ${styles[status]}`}>{status === "live" ? "Ao vivo" : status === "updating" ? "Atualizando" : status === "offline" ? "Offline" : "Conectando"}</span>;
}
