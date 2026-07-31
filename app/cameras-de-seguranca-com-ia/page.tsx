import { ContentSection, InfoList, InfoListItem, MarketingPage, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Câmeras de segurança com IA sem trocar o sistema",
  description: "Descubra como aproveitar câmeras e DVRs existentes para criar uma memória visual pesquisável com inteligência artificial.",
  path: "/cameras-de-seguranca-com-ia",
  keywords: ["câmeras de segurança com IA", "DVR com inteligência artificial", "atualizar câmera de segurança"],
});

export default function CamerasComIaPage() {
  return (
    <MarketingPage
      eyebrow="Câmeras de segurança com IA"
      title="Transforme o sistema atual sem substituir toda a infraestrutura."
      lead="Muitas empresas já possuem câmeras suficientes para registrar a rotina, mas continuam dependentes de busca manual no DVR. O MonitorIA.cam adiciona organização e pesquisa sobre esse material."
    >
      <ContentSection label="Requisitos" title="O que normalmente é necessário para começar.">
        <InfoList>
          <InfoListItem title="Câmera ou DVR acessível na rede local">O equipamento precisa oferecer um fluxo que possa ser acessado pelo computador do Agent, normalmente via RTSP.</InfoListItem>
          <InfoListItem title="Computador Windows ligado">O Agent local precisa permanecer em execução para observar os fluxos e enviar acontecimentos relevantes.</InfoListItem>
          <InfoListItem title="Acesso à internet para saída">O computador envia chamadas HTTPS para o MonitorIA.cam. Não é necessário abrir a rede da empresa para conexões externas de entrada.</InfoListItem>
          <InfoListItem title="Enquadramento adequado">A qualidade da análise depende de a câmera mostrar claramente a área, sem excesso de distância, contraluz ou obstrução.</InfoListItem>
        </InfoList>
      </ContentSection>

      <ContentSection label="Diferença" title="Não é um novo DVR nem uma nuvem de gravação contínua.">
        <Prose>
          <p>O DVR continua responsável pela gravação original. O MonitorIA.cam cria uma camada complementar: detecta acontecimentos, guarda descrições e permite localizar o horário que deve ser assistido.</p>
          <p>Essa separação reduz a necessidade de transferir todo o vídeo e permite manter a infraestrutura de gravação que já funciona na empresa.</p>
        </Prose>
      </ContentSection>

      <ContentSection label="Instalação" title="A compatibilidade é validada antes da operação.">
        <Prose>
          <p>Na configuração inicial, o Agent testa o fluxo, captura um frame e associa a câmera ao local correto. Depois, o usuário define o que deseja acompanhar e quais áreas devem ser consideradas ou ignoradas.</p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
