import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
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
import { AssistedJourneyTracker } from "@/src/components/vip-landing/assisted-journey";
import { VipAssistedClosing } from "@/src/components/vip-landing/assisted-closing";
import { VipVideoEvidence } from "@/src/components/vip-landing/video-evidence";
import { SalesProof } from "@/src/components/landing/sales-proof";
import { VipStructuredData } from "@/src/components/vip-landing/structured-data";
import { getSalesTrialInvite } from "@/src/lib/sales-trial";
import { getVipPlanCatalog } from "@/src/vip/server";
import { VIP_ASSIST_COOKIE, vipAssistAlias } from "@/src/vip/assisted";
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
    icon: [{ url: "/vip-favicon.svg", type: "image/svg+xml" }],
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
  // O VIP é uma venda consultiva. A página continua acessível pelo link,
  // mas não deve entrar em aquisição orgânica nem competir com a landing padrão.
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
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
  const cookieStore = await cookies();
  const assistToken = cookieStore.get(VIP_ASSIST_COOKIE)?.value ?? "";

  const [plans, query, invite] = await Promise.all([
    getVipPlanCatalog(),
    searchParams,
    assistToken
      ? getSalesTrialInvite(assistToken).catch(() => null)
      : Promise.resolve(null),
  ]);

  const assisted = Boolean(
    invite?.vipProjectId && ["active", "redeemed"].includes(invite.status),
  );
  const alias = invite ? vipAssistAlias(invite.id) : null;

  return (
    <main className={`${styles.page} ${vip.vipPage}`}>
      <VipStructuredData plans={plans} />
      <ClarityScript />
      {assisted && invite && alias ? (
        <AssistedJourneyTracker inviteId={invite.id} alias={alias} />
      ) : null}

      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railFill} />
      </div>

      <VipLandingHeader />
      <VipHero />
      <VipProblem />
      <SalesProof experience="vip" />
      <VipSectors />
      <VipHowItWorks />
      <VipVideoEvidence />
      <VipUnderstands />
      <VipAssistant />
      <VipPlans plans={plans} />
      <VipTrial />
      <VipFaq />
      {assisted && invite && alias ? (
        <VipAssistedClosing
          companyName={invite.companyName}
          alias={alias}
          redeemed={invite.status === "redeemed"}
        />
      ) : (
        <VipClosing query={query} />
      )}
      <VipLandingFooter />
    </main>
  );
}
