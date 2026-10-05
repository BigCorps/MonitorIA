"use client";

import { useEffect, useState } from "react";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  applyGoogleConsent,
} from "@/src/lib/analytics";
import { applyOpenAiAdsConsent } from "@/src/lib/openai-ads";
import { applyMetaAdsConsent } from "@/src/lib/meta-ads";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [compacto, setCompacto] = useState(false);
  const [vip, setVip] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 639px)");
    const atualizar = () => setCompacto(consulta.matches);
    atualizar();
    setVip(window.location.hostname.toLowerCase() === "vip.monitoria.cam");
    consulta.addEventListener("change", atualizar);
    return () => consulta.removeEventListener("change", atualizar);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    if (stored === "granted") {
      applyGoogleConsent(true);
      applyOpenAiAdsConsent(true);
      applyMetaAdsConsent(true);
      return;
    }
    if (stored === "denied") {
      applyGoogleConsent(false);
      applyOpenAiAdsConsent(false);
      applyMetaAdsConsent(false);
      return;
    }
    setVisible(true);
  }, []);

  function choose(granted: boolean) {
    localStorage.setItem(
      ANALYTICS_CONSENT_STORAGE_KEY,
      granted ? "granted" : "denied",
    );
    applyGoogleConsent(granted);
    applyOpenAiAdsConsent(granted);
    applyMetaAdsConsent(granted);
    setVisible(false);
  }

  if (!visible) return null;

  const botaoBase = {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    padding: "0 14px",
    fontSize: 14,
    fontWeight: 800,
    lineHeight: 1,
    cursor: "pointer",
  } as const;

  const linkColor = vip ? "#e2bd59" : "#58e2c7";

  return (
    <div
      role="dialog"
      aria-label="Preferências de cookies"
      data-experience={vip ? "vip" : "standard"}
      style={{
        position: "fixed",
        left: compacto ? 12 : 16,
        right: compacto ? 12 : 16,
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${compacto ? 12 : 16}px)`,
        zIndex: 1000,
        maxWidth: 430,
        padding: compacto ? 12 : 16,
        border: vip
          ? "1px solid rgba(224,202,143,.28)"
          : "1px solid rgba(255,255,255,.14)",
        borderRadius: 16,
        background: vip ? "rgba(8,9,11,.97)" : "rgba(7,17,31,.96)",
        color: vip ? "#f7f5ee" : "#f8fafc",
        boxShadow: vip
          ? "0 18px 54px rgba(0,0,0,.48), 0 0 0 1px rgba(220,180,77,.025)"
          : "0 18px 50px rgba(0,0,0,.35)",
        backdropFilter: "blur(14px)",
      }}
    >
      <p
        style={{
          margin: compacto ? "0 0 10px" : "0 0 12px",
          fontSize: 13,
          lineHeight: compacto ? 1.4 : 1.55,
          color: vip ? "#c8c1ac" : "#cbd5e1",
        }}
      >
        {compacto ? (
          <>
            Usamos cookies para melhorar sua experiência.{" "}
            <a href="/privacidade" style={{ color: linkColor, fontWeight: 700 }}>
              Saiba mais
            </a>
          </>
        ) : (
          <>
            Usamos cookies de medição para entender a navegação, atribuir
            resultados de campanhas e melhorar o MonitorIA. Você pode aceitar
            ou recusar os cookies não essenciais. Veja a nossa{" "}
            <a href="/privacidade" style={{ color: linkColor }}>
              política de privacidade
            </a>
            .
          </>
        )}
      </p>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => choose(true)}
          style={{
            ...botaoBase,
            border: vip ? "1px solid rgba(255,236,167,.48)" : 0,
            background: vip
              ? "linear-gradient(112deg,#8a5c12,#d7ac43 38%,#f2da84 52%,#a8751b)"
              : "#f8fafc",
            color: vip ? "#140f06" : "#07111f",
          }}
        >
          Aceitar
        </button>
        <button
          type="button"
          onClick={() => choose(false)}
          style={{
            ...botaoBase,
            border: vip
              ? "1px solid rgba(218,178,72,.34)"
              : "1px solid rgba(255,255,255,.2)",
            background: vip ? "rgba(218,178,72,.035)" : "transparent",
            color: vip ? "#e6d6a5" : "#e2e8f0",
          }}
        >
          Recusar
        </button>
      </div>
    </div>
  );
}
