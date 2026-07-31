import type { MetadataRoute } from "next";
import { appConfig } from "@/src/lib/app-config";

const pages: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/como-funciona", changeFrequency: "monthly", priority: 0.9 },
  { path: "/recursos", changeFrequency: "monthly", priority: 0.85 },
  { path: "/ia-para-cameras", changeFrequency: "monthly", priority: 0.9 },
  { path: "/cameras-de-seguranca-com-ia", changeFrequency: "monthly", priority: 0.9 },
  { path: "/para-comercios", changeFrequency: "monthly", priority: 0.85 },
  { path: "/seguranca-e-privacidade", changeFrequency: "monthly", priority: 0.8 },
  { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
  { path: "/sobre", changeFrequency: "yearly", priority: 0.6 },
  { path: "/contato", changeFrequency: "yearly", priority: 0.6 },
  { path: "/privacidade", changeFrequency: "yearly", priority: 0.4 },
  { path: "/termos", changeFrequency: "yearly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return pages.map((page) => ({
    url: new URL(page.path, appConfig.url).toString(),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
