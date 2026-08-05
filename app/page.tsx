import { ClarityScript } from "@/src/components/analytics/clarity";
import { MonitoriaStructuredData } from "@/src/components/seo/monitoria-structured-data";
import { Hero, LandingFooter, LandingHeader } from "@/src/components/landing/hero";
import {
  Boundaries,
  HowItWorks,
  Problem,
  Retention,
  Sectors,
} from "@/src/components/landing/story";
import { Assistant, Closing, Faq, Plans, Trial } from "@/src/components/landing/commerce";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";
import styles from "@/src/components/landing/landing.module.css";

export const metadata = createPageMetadata({
  title: `${appConfig.name} — ${appConfig.slogan}`,
  description: appConfig.description,
  path: "/",
  keywords: [
    "inteligência artificial para câmeras",
    "câmera de segurança com IA",
    "pesquisa em gravações de câmeras",
    "análise de vídeo para comércio",
    "memória visual pesquisável",
  ],
});

export default function HomePage() {
  return (
    <main className={styles.page}>
      <MonitoriaStructuredData />
      <ClarityScript />

      {/* Régua de tempo: assinatura visual da página. */}
      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railFill} />
      </div>

      <LandingHeader />
      <Hero />
      {/* "Onde funciona" vem logo após o herói: é o ativo visual mais forte
          da página e responde à primeira pergunta de quem chega. */}
      <Sectors />
      <Problem />
      <HowItWorks />
      <Boundaries />
      <Retention />
      <Plans />
      <Assistant />
      <Trial />
      <Faq />
      <Closing />
      <LandingFooter />
    </main>
  );
}
