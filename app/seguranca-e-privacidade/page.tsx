import {
  ContentSection,
  InfoList,
  InfoListItem,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Segurança e privacidade",
  description:
    "Conheça os limites de privacidade do MonitorIA.cam: vídeo contínuo local, credenciais protegidas, isolamento por empresa e continuidade visual não biométrica.",
  path: "/seguranca-e-privacidade",
  keywords: [
    "LGPD câmeras com IA",
    "privacidade análise de vídeo",
    "segurança câmera RTSP",
  ],
});

export default function SegurancaPrivacidadePage() {
  return (
    <MarketingPage
      eyebrow="Segurança e privacidade"
      title="O sistema foi desenhado para analisar menos dados, não para copiar toda a gravação."
      lead="O vídeo contínuo permanece no ambiente do cliente. O MonitorIA.cam trabalha com quadros selecionados de acontecimentos e metadados necessários para pesquisa e inteligência operacional."
    >
      <ContentSection label="Princípios" title="Limites técnicos incorporados ao produto.">
        <InfoList>
          <InfoListItem title="Gravação contínua no local">
            O DVR ou NVR continua armazenando o vídeo original conforme a
            configuração da empresa. O MonitorIA recebe somente as evidências
            selecionadas necessárias ao serviço.
          </InfoListItem>
          <InfoListItem title="Credenciais protegidas localmente">
            Endereços e senhas RTSP são usados pelo Agent e não são enviados ao
            provedor de inteligência artificial. No fluxo de descoberta pelo
            painel, credenciais temporárias são cifradas enquanto aguardam o
            Agent e removidas ao final da execução.
          </InfoListItem>
          <InfoListItem title="Seleção de quadros">
            Somente imagens selecionadas de um acontecimento são enviadas para
            análise, reduzindo o volume de dados processados fora do local.
          </InfoListItem>
          <InfoListItem title="Isolamento por organização">
            O banco aplica controles para que cada empresa acesse somente os
            próprios locais, câmeras, eventos, evidências e conversas.
          </InfoListItem>
          <InfoListItem title="Sem reconhecimento facial ou identificação civil">
            O MonitorIA não usa reconhecimento facial para descobrir o nome ou
            a identidade civil de uma pessoa. Quando recursos de continuidade
            estão habilitados, características visuais amplas podem ser
            correlacionadas de forma probabilística entre acontecimentos.
          </InfoListItem>
          <InfoListItem title="Continuidade operacional não biométrica">
            Memória curta e perfis operacionais podem combinar aparência ampla,
            área, horário e atividade para estimar continuidade de uma pessoa ou
            membro da equipe. A correspondência é probabilística, pode exigir
            revisão humana e não confirma identidade.
          </InfoListItem>
          <InfoListItem title="Continuidade de veículos">
            Quando habilitada, a memória de veículos pode correlacionar tipo,
            cor, formato e outras características visíveis durante uma janela
            configurada, sem transformar a correlação em identificação civil do
            proprietário ou condutor.
          </InfoListItem>
          <InfoListItem title="Retenção configurável">
            Frames temporários, keyframes, clipes preservados e metadados usam
            classes de retenção e expurgo, com prazos associados à organização.
          </InfoListItem>
        </InfoList>
      </ContentSection>

      <ContentSection
        label="Inteligência artificial"
        title="O processamento visual pode envolver fornecedores contratados."
      >
        <Prose>
          <p>
            Quadros selecionados e contexto técnico do acontecimento podem ser
            processados por provedores de inteligência artificial contratados
            pelo MonitorIA.cam. Dependendo do fornecedor e da infraestrutura,
            esse processamento pode envolver transferência internacional de
            dados.
          </p>
          <p>
            Resultados de visão computacional e inteligência artificial são
            inferências. Iluminação, enquadramento, resolução, obstruções e
            qualidade da câmera podem produzir erros; decisões relevantes devem
            considerar a gravação original e outras evidências disponíveis.
          </p>
          <p>
            A organização que utiliza o sistema continua responsável por
            informar adequadamente funcionários, clientes e visitantes sobre o
            monitoramento e pela definição da base legal aplicável ao seu
            ambiente.
          </p>
          <Note>
            Esta página descreve o desenho do produto e não substitui uma análise
            jurídica específica da operação de cada cliente.
          </Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
