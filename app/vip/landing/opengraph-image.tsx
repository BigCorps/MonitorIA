import { ImageResponse } from "next/og";

export const alt = "MonitorIA VIP — Inteligência para operações em escala";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const gold =
  "linear-gradient(110deg,#7a520e 0%,#bd8a25 25%,#f2d981 47%,#fff0aa 53%,#c8942d 72%,#805511 100%)";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px 76px",
          background:
            "radial-gradient(circle at 82% 12%,rgba(210,160,42,.18),transparent 34%),linear-gradient(145deg,#050607,#0c0e11)",
          color: "#f6f3e8",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              fontSize: 34,
              fontWeight: 800,
              letterSpacing: -1.5,
            }}
          >
            MonitorIA.cam
          </div>
          <div
            style={{
              padding: "7px 12px",
              border: "1px solid #b88a2d",
              borderRadius: 999,
              color: "#e8c96e",
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            VIP
          </div>
        </div>

        <div
  style={{
    maxWidth: 940,
    display: "flex",
    flexDirection: "column",
  }}
>
          <div
            style={{
              fontSize: 74,
              lineHeight: 0.98,
              fontWeight: 800,
              letterSpacing: -4,
            }}
          >
            Muitas câmeras.
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 74,
              lineHeight: 0.98,
              fontWeight: 800,
              letterSpacing: -4,
              background: gold,
              color: "transparent",
              backgroundClip: "text",
            }}
          >
            Uma operação pesquisável.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 25,
              lineHeight: 1.4,
              color: "#aaa89f",
            }}
          >
            Grandes empresas · Empresas de segurança · Projetos científicos
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 24,
            color: "#8f8978",
            fontSize: 18,
          }}
        >
          <span>10+ câmeras</span>
          <span>•</span>
          <span>Intensive</span>
          <span>•</span>
          <span>Pesquisa IA</span>
          <span>•</span>
          <span>Piloto acompanhado</span>
        </div>
      </div>
    ),
    size,
  );
}
