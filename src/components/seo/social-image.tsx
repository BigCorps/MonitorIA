import { ImageResponse } from "next/og";
import { appConfig } from "@/src/lib/app-config";

export const socialImageSize = { width: 1200, height: 630 };

export function createSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background:
            "radial-gradient(circle at 78% 18%, rgba(79,140,255,.42), transparent 34%), radial-gradient(circle at 10% 90%, rgba(87,230,199,.28), transparent 36%), #07111f",
          color: "#f4f8ff",
          fontFamily: "Arial, Helvetica, sans-serif",
          padding: "72px 82px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.14,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.16) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.16) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 1,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                border: "2px solid rgba(87,230,199,.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 34,
                color: "#57e6c7",
                background: "rgba(87,230,199,.08)",
              }}
            >
              ◉
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-2px" }}>
              Monitor<span style={{ color: "#57e6c7" }}>IA</span>.cam
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 930 }}>
            <div
              style={{
                fontSize: 76,
                lineHeight: 1.02,
                letterSpacing: "-4px",
                fontWeight: 750,
              }}
            >
              Suas câmeras agora podem lembrar o que aconteceu.
            </div>
            <div style={{ fontSize: 28, color: "#aebed2", lineHeight: 1.35 }}>
              Memória visual pesquisável para câmeras de segurança comuns.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22 }}>
            <span style={{ color: "#57e6c7" }}>{appConfig.domain}</span>
            <span style={{ color: "#8294aa" }}>Desenvolvido por {appConfig.company}</span>
          </div>
        </div>
      </div>
    ),
    socialImageSize,
  );
}
