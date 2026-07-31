import { CardGrid, ContentSection, InfoCard, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Inteligência artificial para câmeras",
  description: "Veja como adicionar inteligência artificial a câmeras existentes para organizar acontecimentos e encontrar momentos específicos sem assistir horas de vídeo.",
  path: "/ia-para-cameras",
  keywords: ["IA para câmeras", "inteligência artificial em câmeras", "análise inteligente de vídeo"],
});

export default function IaParaCamerasPage() {
  return (
    <MarketingPage
      eyebrow="IA para câmeras"
      title="Inteligência artificial não precisa começar pela troca das câmeras."
      lead="É possível adicionar uma camada de análise sobre equipamentos existentes. A IA recebe momentos selecionados, descreve o que aparece e transforma o vídeo em registros que podem ser pesquisados."
    >
      <ContentSection label="Aplicação" title="O que a IA pode organizar em uma câmera estática.">
        <CardGrid>
          <InfoCard label="Movimento" title="Entradas e saídas">Registra movimentações visíveis em zonas configuradas, com horário e contexto do evento.</InfoCard>
          <InfoCard label="Objetos" title="Aparecimento e retirada">Descreve alterações relevantes em balcões, áreas de entrega, estoque ou outros pontos definidos.</InfoCard>
          <InfoCard label="Veículos" title="Presença e características">Organiza registros de veículos visíveis por tipo, cor, horário e área, sem afirmar identidade quando a imagem não permite.</InfoCard>
          <InfoCard label="Rotina" title="Abertura e fechamento">Ajuda a localizar os primeiros e últimos sinais operacionais observados pela câmera.</InfoCard>
          <InfoCard label="Atendimento" title="Sinais de interação">Identifica eventos com sinais visuais de atendimento, sem afirmar que houve venda, pagamento ou conclusão de serviço.</InfoCard>
          <InfoCard label="Segurança" title="Movimento fora de horário">Facilita encontrar acontecimentos em períodos em que o local deveria estar vazio.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Limites" title="Análise visual é evidência auxiliar, não certeza absoluta.">
        <Prose>
          <p>A qualidade depende do enquadramento, iluminação, resolução, distância e obstruções. Uma câmera pode registrar que uma pessoa carregava um objeto visível, mas não deve inferir identidade, intenção ou culpa.</p>
          <p>O MonitorIA.cam foi desenhado para ajudar a localizar e organizar acontecimentos. Quando uma decisão importante depende do fato, o usuário deve conferir o trecho original no DVR.</p>
          <Note>O produto padrão não utiliza reconhecimento facial e não tenta acompanhar a identidade de uma pessoa entre eventos diferentes.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
