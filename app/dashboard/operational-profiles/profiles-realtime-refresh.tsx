"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/src/lib/supabase/client";
import styles from "./profiles.module.css";

type Status = "connecting" | "live" | "updating" | "offline";

export function ProfilesRealtimeRefresh({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      setStatus("updating");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        router.refresh();
        setStatus("live");
      }, 900);
    };

    const channel = supabase
      .channel(`staff-operational-profiles:${organizationId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "camera_staff_profiles",
        filter: `organization_id=eq.${organizationId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "staff_profile_candidates",
        filter: `organization_id=eq.${organizationId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "staff_profile_match_decisions",
        filter: `organization_id=eq.${organizationId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "staff_profile_update_proposals",
        filter: `organization_id=eq.${organizationId}`,
      }, refresh)
      .subscribe((next: string) => {
        if (next === "SUBSCRIBED") setStatus("live");
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(next)) setStatus("offline");
      });

    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  return (
    <div className={`${styles.realtime} ${styles[status]}`}>
      <span aria-hidden="true" />
      {status === "connecting" ? "Conectando" : null}
      {status === "live" ? "Ao vivo" : null}
      {status === "updating" ? "Atualizando" : null}
      {status === "offline" ? "Atualização manual" : null}
    </div>
  );
}
