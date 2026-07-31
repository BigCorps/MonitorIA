import type { MetadataRoute } from "next";
import { appConfig } from "@/src/lib/app-config";

const blockedPaths = [
  "/api/",
  "/auth/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: blockedPaths,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: blockedPaths,
      },
    ],
    sitemap: `${appConfig.url}/sitemap.xml`,
    host: appConfig.url,
  };
}
