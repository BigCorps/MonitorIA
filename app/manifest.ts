import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MonitorIA.cam — Sua câmera vê. A MonitorIA lembra.",
    short_name: "MonitorIA.cam",
    description:
      "Transforme câmeras comuns em uma memória visual pesquisável com eventos estruturados por IA.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#07111F",
    theme_color: "#07111F",
    icons: [
      {
        src: "/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
