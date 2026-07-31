import { ContentSection, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Sobre o MonitorIA.cam",
  description: "Conheça a proposta do MonitorIA.cam, uma solução da BigCorps para transformar câmeras existentes em uma memória visual pesquisável.",
  path: "/sobre",
});

export default function SobrePage() {
  return (
    <MarketingPage
      eyebrow="Sobre"
      title="O que aconteceu não deveria ficar perdido em horas de gravação."
      lead="O MonitorIA.cam nasceu para transformar câmeras estáticas em uma fonte de informação pesquisável, aproveitando a infraestrutura já instalada nas empresas."
    >
      <ContentSection label="Produto" title="Uma memória visual para segurança e operação.">
        <Prose>
          <p>As câmeras registram grande parte da rotina de uma empresa, mas essas informações normalmente desaparecem dentro de gravações difíceis de consultar. O MonitorIA.cam cria eventos estruturados para que o usuário possa pesquisar situações e localizar rapidamente o momento original.</p>
          <p>A solução é desenvolvida pela BigCorps e combina Agent local, processamento visual, banco de eventos, painel operacional e assistente de pesquisa.</p>
        </Prose>
      </ContentSection>

      <ContentSection label="Direção" title="A tecnologia deve reduzir trabalho manual sem inventar certezas.">
        <Prose>
          <p>O produto prioriza descrições verificáveis, indicação de incerteza, revisão humana e acesso ao registro original. Não utilizamos reconhecimento facial no produto padrão e não inferimos identidade, culpa ou intenção a partir de uma imagem.</p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
