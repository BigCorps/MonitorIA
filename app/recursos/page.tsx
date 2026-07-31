import { CardGrid, ContentSection, InfoCard, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Recursos",
  description: "Conheça os recursos do MonitorIA.cam para organizar acontecimentos, pesquisar gravações, comparar períodos e gerar relatórios visuais.",
  path: "/recursos",
  keywords: ["análise de vídeo com IA", "pesquisa de eventos em câmeras", "relatório de câmeras"],
});

export default function RecursosPage() {
  return (
    <MarketingPage
      eyebrow="Recursos"
      title="Uma camada de inteligência sobre as câmeras que sua empresa já possui."
      lead="O MonitorIA.cam organiza acontecimentos em vez de obrigar o usuário a assistir horas de gravação. Os recursos foram pensados para segurança, operação e análise da rotina."
    >
      <ContentSection label="Pesquisa" title="Pergunte sobre o que aconteceu.">
        <CardGrid>
          <InfoCard label="Busca" title="Pesquisa em português">Localize situações por período, câmera, local, tipo de acontecimento, objetos, roupas ou veículos visíveis.</InfoCard>
          <InfoCard label="Evidências" title="Eventos clicáveis">As respostas apresentam os registros usados como evidência, com resumo, horário e acesso ao detalhe.</InfoCard>
          <InfoCard label="Histórico" title="Conversas privadas">O assistente mantém o contexto das pesquisas da organização sem misturar informações de outras empresas.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Operação" title="Indicadores úteis para o dia a dia.">
        <CardGrid>
          <InfoCard label="Períodos" title="Comparações">Compare dias ou intervalos para observar mudanças de movimento e categorias de acontecimentos.</InfoCard>
          <InfoCard label="Gráficos" title="Visualizações">Gere gráficos de horários, categorias e indicadores com base nos eventos registrados.</InfoCard>
          <InfoCard label="Exportação" title="Markdown e JSON">Exporte o período filtrado para análise, auditoria ou integração com outras ferramentas.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Configuração" title="Cada câmera pode ter um objetivo diferente.">
        <Prose>
          <p>Entrada, caixa, estoque e área externa não precisam usar a mesma configuração. O perfil da câmera pode definir zonas, objetivos, instruções do que ignorar, horários de monitoramento e nível de detalhe.</p>
          <p>Os modos Econômico, Equilibrado e Detalhado permitem ajustar frequência, quantidade de quadros e profundidade da análise conforme o valor daquela câmera para o negócio.</p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
