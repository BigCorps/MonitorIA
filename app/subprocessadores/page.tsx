import {
  CardGrid,
  ContentSection,
  InfoCard,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Subprocessadores",
  description:
    "Fornecedores que apoiam a operação do MonitorIA.cam e suas finalidades.",
  path: "/subprocessadores",
});

export default function SubprocessadoresPage() {
  return (
    <MarketingPage
      eyebrow="Subprocessadores"
      title="Fornecedores usados para operar o MonitorIA.cam."
      lead="Lista atualizada em 29 de agosto de 2026. O uso efetivo varia conforme o recurso contratado e a configuração do serviço."
    >
      <ContentSection label="Infraestrutura" title="Serviços essenciais e finalidade.">
        <CardGrid>
          <InfoCard label="BANCO, AUTENTICAÇÃO E STORAGE" title="Supabase">
            PostgreSQL, autenticação, armazenamento das evidências selecionadas e
            funções de backend. A instância atualmente utilizada pelo MonitorIA
            opera nos Estados Unidos.
          </InfoCard>
          <InfoCard label="APLICAÇÃO" title="Vercel">
            Hospedagem do painel e execução de rotas serverless. Pode processar
            dados técnicos, autenticação de sessão e conteúdo necessário a cada
            requisição do serviço.
          </InfoCard>
          <InfoCard label="INTELIGÊNCIA ARTIFICIAL" title="OpenAI">
            Rotas generativas de análise visual e funcionalidades de assistente.
            Recebe somente os quadros selecionados e o contexto necessário ao
            recurso executado. Nas chamadas de visão, o aplicativo solicita por
            padrão <code>store: false</code>; o tratamento pelo fornecedor segue
            as condições e políticas aplicáveis ao serviço contratado.
          </InfoCard>
          <InfoCard label="SITE PÚBLICO" title="Microsoft Clarity">
            Medição de navegação apenas nas páginas públicas. Não recebe imagens
            de câmeras, eventos, credenciais de câmeras nem dados do painel
            autenticado.
          </InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Transferência internacional" title="Salvaguardas e transparência.">
        <Prose>
          <p>
            Parte do tratamento pode ocorrer fora do Brasil. A contratação e a
            operação devem incorporar mecanismos compatíveis com a LGPD e com as
            regras aplicáveis de transferência internacional de dados.
          </p>
          <p>
            Alterações materiais nesta lista serão publicadas nesta página.
            Contratos empresariais podem prever aviso adicional e regras para
            objeção quando aplicável.
          </p>
          <Note>
            Prestadores escolhidos diretamente pelo cliente, como o provedor do
            DVR, a rede local ou assistentes externos autorizados por ele via MCP,
            não integram automaticamente esta lista de subprocessadores da
            BigCorps; nesses casos o terceiro também atua sob seus próprios termos.
          </Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
