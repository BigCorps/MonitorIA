import { ClarityScript } from "@/src/components/analytics/clarity";
import { MonitoriaStructuredData } from "@/src/components/seo/monitoria-structured-data";
import { Hero, LandingFooter, LandingHeader } from "@/src/components/landing/hero";
import { HowItWorks, Problem, Sectors, Understands } from "@/src/components/landing/story";
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

/* ==========================================================================
   ESTRUTURA DA PÁGINA
   ==========================================================================

   Passou de 11 para 9 seções, com mais conteúdo do que antes. O que mudou:

   - <Problem /> absorveu a antiga <Retention />. Eram o mesmo argumento
     contado duas vezes; agora a dor e a prova de retenção moram juntas.
   - <Trial /> absorveu a antiga <Boundaries />. Os limites declarados
     ficaram encostados no botão, respondendo a última objeção.
   - <Understands /> é nova e cobre a parte do produto que não aparecia:
     sessões, rotina aprendida, saúde da câmera, estado de portão e cofre,
     perfil de equipe e continuidade.
   - A integração com ChatGPT e Claude entrou dentro de <Assistant /> em vez
     de virar uma décima seção.

   <Sectors /> continua em segundo lugar: os vídeos são o que prende quem
   acaba de chegar.

   Sobre o fundo alternado: nenhuma seção teve seu próprio fundo alterado.
   <Understands /> ficou sem o modificador `sectionDeep`, seguindo o mesmo
   ritmo que a antiga <Boundaries /> tinha nessa posição. Se quiser inverter,
   é só adicionar ou remover `styles.sectionDeep` no componente.
   ========================================================================== */

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
      <Sectors />
      <Problem />
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
