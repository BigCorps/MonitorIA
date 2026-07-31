import { CardGrid, ContentSection, InfoCard, InfoList, InfoListItem, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Como funciona",
  description: "Entenda como o MonitorIA.cam conecta câmeras e DVRs existentes, detecta acontecimentos localmente e cria uma memória visual pesquisável.",
  path: "/como-funciona",
  keywords: ["como funciona câmera com IA", "IA para DVR", "pesquisa em gravação de câmera"],
});

export default function ComoFuncionaPage() {
  return (
    <MarketingPage
      eyebrow="Como funciona"
      title="Da câmera existente até uma resposta pesquisável."
      lead="O MonitorIA.cam não substitui o DVR e não precisa receber a gravação contínua. Um Agent local identifica movimentações, seleciona quadros relevantes e envia somente os acontecimentos necessários para análise."
    >
      <ContentSection label="Fluxo" title="Quatro etapas, do movimento à pesquisa.">
        <CardGrid>
          <InfoCard label="01" title="Conexão local">O Agent Windows acessa as câmeras ou o DVR dentro da rede da empresa. As credenciais permanecem protegidas no computador local.</InfoCard>
          <InfoCard label="02" title="Detecção de movimento">O processamento local identifica quando existe alteração relevante. Períodos parados não precisam ser enviados para análise.</InfoCard>
          <InfoCard label="03" title="Descrição por IA">Quadros selecionados do acontecimento são analisados e transformados em horário, resumo, categorias, objetos, pessoas e veículos visíveis.</InfoCard>
          <InfoCard label="04" title="Pesquisa em português">O usuário pergunta o que ocorreu e recebe os registros compatíveis, com o horário necessário para conferir o trecho original no DVR.</InfoCard>
          <InfoCard label="05" title="Histórico pesquisável">Os metadados podem permanecer disponíveis por mais tempo que a gravação original, conforme a política contratada.</InfoCard>
          <InfoCard label="06" title="Revisão humana">Eventos incertos podem ser sinalizados para conferência. O sistema não trata uma interpretação visual como verdade absoluta.</InfoCard>
        </CardGrid>
      </ContentSection>

      <ContentSection label="Arquitetura" title="O vídeo contínuo permanece no local.">
        <InfoList>
          <InfoListItem title="Câmera ou DVR">Continua gravando normalmente, sem perder as funções já existentes.</InfoListItem>
          <InfoListItem title="Agent local">Faz a conexão com RTSP, detecta movimento e protege as credenciais usando recursos do Windows.</InfoListItem>
          <InfoListItem title="MonitorIA.cam">Recebe acontecimentos selecionados, organiza os dados e oferece painel, pesquisa, relatórios e assistente.</InfoListItem>
          <InfoListItem title="Usuário">Localiza rapidamente o horário e volta ao sistema de gravação apenas quando precisa assistir ao vídeo original.</InfoListItem>
        </InfoList>
      </ContentSection>

      <ContentSection label="Compatibilidade" title="O objetivo é aproveitar a estrutura que já existe.">
        <Prose>
          <p>O requisito principal é que a câmera ou o DVR disponibilize um fluxo acessível dentro da rede local, normalmente por RTSP. A compatibilidade final depende do equipamento, da rede e das credenciais disponíveis.</p>
          <p>Durante a instalação, o sistema testa o acesso, captura um primeiro frame e permite configurar zonas e objetivos de monitoramento para cada câmera.</p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
