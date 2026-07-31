import { ContentSection, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Contato",
  description: "Fale com a equipe do MonitorIA.cam para avaliar câmeras, DVR, instalação, quantidade de locais e objetivos de monitoramento.",
  path: "/contato",
});

export default function ContatoPage() {
  return (
    <MarketingPage
      eyebrow="Contato"
      title="Conte como suas câmeras são usadas hoje."
      lead="Para avaliar a instalação, informe a quantidade de locais, número de câmeras, modelo do DVR quando disponível e quais acontecimentos sua empresa precisa localizar."
    >
      <ContentSection label="Atendimento" title="Conversa inicial pelo WhatsApp.">
        <Prose>
          <p>O primeiro contato serve para entender a estrutura atual e verificar se o MonitorIA.cam se encaixa no objetivo da empresa.</p>
          <p>
            <a href={appConfig.whatsappUrl} target="_blank" rel="noopener noreferrer">
              Abrir conversa com a equipe do MonitorIA.cam
            </a>
          </p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
