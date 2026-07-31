import type { MetadataRoute } from "next";
import { appConfig } from "@/src/lib/app-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${appConfig.name} — ${appConfig.slogan}`,
    short_name: appConfig.name,
    description: appConfig.description,
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
