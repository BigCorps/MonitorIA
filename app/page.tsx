import { ClarityScript } from "@/src/components/analytics/clarity";
import { MonitoriaStructuredData } from "@/src/components/seo/monitoria-structured-data";
import { Hero, LandingFooter, LandingHeader } from "@/src/components/landing/hero";
import { HowItWorks, Problem, Sectors, Understands } from "@/src/components/landing/story";
import { SalesProof } from "@/src/components/landing/sales-proof";
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

/*
 * Gate Comercial 2026-10:
 * hero -> dor -> prova com os números do visitante -> setores -> produto.
 * A mudança é exclusivamente de narrativa comercial. Trial, planos,
 * autenticação, câmera, Agent e backend permanecem com os mesmos contratos.
 */
export default function HomePage() {
  return (
    <main className={styles.page}>
      <MonitoriaStructuredData />
      <ClarityScript />

      <div className={styles.rail} aria-hidden="true">
        <span className={styles.railFill} />
      </div>

      <LandingHeader />
      <Hero />
      <Problem />
      <SalesProof experience="standard" />
      <Sectors />
      <HowItWorks />
      <Understands />
      <Assistant />
      <Plans />
      <Trial />
      <Faq />
      <Closing />
      <LandingFooter />
    </main>
  );
}
