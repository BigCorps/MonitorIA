"use client";

import { useEffect, useRef } from "react";
import type { VipAssistSection } from "@/src/vip/assisted";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

const WATCH: Array<{ selector: string; section: VipAssistSection }> = [
  { selector: "#como-funciona", section: "como_funciona" },
  { selector: "#evidencias", section: "evidencias" },
  { selector: "#inteligencia", section: "inteligencia" },
  { selector: "#planos", section: "planos" },
  { selector: "#duvidas", section: "duvidas" },
  { selector: "#contato", section: "pronto" },
];

async function report(section: VipAssistSection, kind: "opened" | "section") {
  try {
    await fetch("/api/vip/assisted/presence", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ section, kind }),
    });
  } catch {
    // A apresentação não deve falhar se telemetria comercial estiver indisponível.
  }
}

export function AssistedJourneyTracker({
  inviteId,
  alias,
}: {
  inviteId: string;
  alias: string;
}) {
  const lastSection = useRef<VipAssistSection>("inicio");

  useEffect(() => {
    void report("inicio", "opened");

    let identified = false;
    let attempts = 0;
    const identify = () => {
      attempts += 1;
      if (typeof window.clarity === "function") {
        let sessionId = "";
        try {
          sessionId = window.sessionStorage.getItem("monitoria-vip-clarity-session") ?? "";
          if (!sessionId) {
            sessionId = window.crypto.randomUUID();
            window.sessionStorage.setItem("monitoria-vip-clarity-session", sessionId);
          }
        } catch {
          sessionId = `vip-${Date.now()}`;
        }

        window.clarity("identify", alias, sessionId, "vip-assisted-landing", alias);
        window.clarity("set", "vip_assisted", "true");
        window.clarity("set", "vip_alias", alias);
        window.clarity("event", "vip_assisted_landing_opened");
        identified = true;
      }
    };

    identify();
    const clarityTimer = window.setInterval(() => {
      if (identified || attempts >= 30) {
        window.clearInterval(clarityTimer);
        return;
      }
      identify();
    }, 500);

    const heartbeatTimer = window.setInterval(() => {
      void report(lastSection.current, "section");
    }, 15_000);

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        const match = WATCH.find(
          (item) => document.querySelector(item.selector) === visible.target,
        );
        if (!match || lastSection.current === match.section) return;
        lastSection.current = match.section;
        void report(match.section, "section");
        window.clarity?.("event", `vip_section_${match.section}`);
      },
      { threshold: [0.35, 0.55, 0.75], rootMargin: "-15% 0px -35% 0px" },
    );

    for (const item of WATCH) {
      const element = document.querySelector(item.selector);
      if (element) observer.observe(element);
    }

    return () => {
      observer.disconnect();
      window.clearInterval(clarityTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [alias, inviteId]);

  return null;
}
