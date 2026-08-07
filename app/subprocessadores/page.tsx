import { CardGrid, ContentSection, InfoCard, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Subprocessadores",
  description: "Fornecedores que apoiam a operação do MonitorIA.cam e suas finalidades.",
  path: "/subprocessadores",
});

export default function SubprocessadoresPage() {
  return (
    <MarketingPage
      eyebrow="Subprocessadores"
      title="Fornecedores usados para operar o MonitorIA.cam."
      lead="Lista atualizada em 7 de agosto de 2026. O uso efetivo varia conforme o recurso contratado e a configuração do serviço."
    >
      <ContentSection label="Infraestrutura" title="Serviços essenciais e finalidade.">
        <CardGrid>
          <InfoCard label="BANCO E AUTENTICAÇÃO" title="Supabase">Banco PostgreSQL, autenticação, armazenamento de evidências e funções de backend. A instância atual opera nos Estados Unidos.</InfoCard>
          <InfoCard label="APLICAÇÃO" title="Vercel">Hospedagem do painel e execução das rotas serverless. Pode processar dados técnicos, conta e conteúdo necessário às requisições.</InfoCard>
          <InfoCard label="INTELIGÊNCIA ARTIFICIAL" title="OpenAI">Análise de quadros selecionados e geração das respostas do assistente, conforme os recursos utilizados pela organização.</InfoCard>
          <InfoCard label="SITE PÚBLICO" title="Microsoft Clarity">Medição de navegação apenas nas páginas públicas. Não recebe imagens de câmeras, eventos, credenciais ou dados do painel.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Transferência internacional" title="Salvaguardas e transparência.">
        <Prose>
          <p>Parte do tratamento pode ocorrer fora do Brasil. A contratação e a operação devem incorporar mecanismos compatíveis com a LGPD e com o Regulamento de Transferência Internacional de Dados da ANPD.</p>
          <p>Alterações materiais nesta lista serão publicadas nesta página. Contratos empresariais podem prever aviso adicional e regras para objeção quando aplicável.</p>
          <Note>Prestadores do cliente, como o provedor do DVR, a rede local ou integrações ativadas por ele, não integram automaticamente esta lista da BigCorps.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
