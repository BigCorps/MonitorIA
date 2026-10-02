import type { Metadata, Viewport } from "next";
import { ClarityScript } from "@/src/components/analytics/clarity";
import {
  VipHero,
  VipLandingFooter,
  VipLandingHeader,
} from "@/src/components/vip-landing/hero";
import {
  VipHowItWorks,
  VipProblem,
  VipSectors,
  VipUnderstands,
} from "@/src/components/vip-landing/story";
import {
  VipAssistant,
  VipClosing,
  VipFaq,
  VipPlans,
  VipTrial,
} from "@/src/components/vip-landing/commerce";
import { VipStructuredData } from "@/src/components/vip-landing/structured-data";
import { getVipPlanCatalog } from "@/src/vip/server";
import { vipConfig } from "@/src/vip/config";
import styles from "@/src/components/landing/landing.module.css";
import vip from "./vip-landing.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    absolute: "MonitorIA VIP — Inteligência para operações em escala",
  },
  description:
    "Transforme dezenas ou centenas de câmeras em informação pesquisável. MonitorIA VIP para grandes empresas, empresas de segurança e projetos científicos.",
  applicationName: vipConfig.productName,
  alternates: {
    canonical: vipConfig.url,
  },
  icons: {
    icon: [
      { url: "/vip-favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/vip-favicon.svg"],
  },
  openGraph: {
    title: "MonitorIA VIP — Inteligência para operações em escala",
    description:
      "Muitas câmeras deixam de ser muitas telas e viram uma operação pesquisável.",
    url: vipConfig.url,
    siteName: vipConfig.productName,
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: `${vipConfig.url}/vip/landing/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "MonitorIA VIP — Inteligência para operações em escala",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MonitorIA VIP — Inteligência para operações em escala",
    description:
      "Muitas câmeras deixam de ser muitas telas e viram uma operação pesquisável.",
    images: [`${vipConfig.url}/vip/landing/twitter-image`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#08090B",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function VipLandingPage({ searchParams }: Props) {
  const [plans, query] = await Promise.all([
    getVipPlanCatalog(),
    searchParams,
  ]);

  return (
    <main className={`${styles.page} ${vip.vipPage}`}>
      <VipStructuredData plans={plans} />
      <ClarityScript />

      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railFill} />
      </div>

      <VipLandingHeader />
      <VipHero />
      <VipSectors />
      <VipProblem />
      <VipHowItWorks />
      <VipUnderstands />
      <VipAssistant />
      <VipPlans plans={plans} />
      <VipTrial />
      <VipFaq />
      <VipClosing query={query} />
      <VipLandingFooter />
    </main>
  );
}
