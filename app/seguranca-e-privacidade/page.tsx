import { ContentSection, InfoList, InfoListItem, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Segurança e privacidade",
  description: "Conheça os limites de privacidade do MonitorIA.cam: vídeo contínuo local, credenciais protegidas, isolamento por empresa e ausência de reconhecimento facial padrão.",
  path: "/seguranca-e-privacidade",
  keywords: ["LGPD câmeras com IA", "privacidade análise de vídeo", "segurança câmera RTSP"],
});

export default function SegurancaPrivacidadePage() {
  return (
    <MarketingPage
      eyebrow="Segurança e privacidade"
      title="O sistema foi desenhado para analisar menos dados, não para copiar toda a gravação."
      lead="O vídeo contínuo permanece no ambiente do cliente. O MonitorIA.cam trabalha com quadros selecionados de acontecimentos e metadados necessários para pesquisa."
    >
      <ContentSection label="Princípios" title="Limites técnicos incorporados ao produto.">
        <InfoList>
          <InfoListItem title="Gravação contínua no local">O DVR ou NVR continua armazenando o vídeo original conforme a configuração da empresa.</InfoListItem>
          <InfoListItem title="Credenciais protegidas localmente">Endereços e senhas RTSP são usados pelo Agent e não são enviados ao provedor de IA.</InfoListItem>
          <InfoListItem title="Seleção de quadros">Somente imagens selecionadas de um acontecimento são enviadas para análise, reduzindo o volume de dados processados.</InfoListItem>
          <InfoListItem title="Isolamento por organização">O banco aplica controles para que cada empresa acesse somente os próprios locais, câmeras, eventos e conversas.</InfoListItem>
          <InfoListItem title="Sem reconhecimento facial padrão">O sistema descreve características visíveis, mas não tenta identificar pessoas nem manter uma identidade entre eventos.</InfoListItem>
          <InfoListItem title="Retenção configurável">Frames temporários, imagens de referência e metadados possuem políticas de retenção e expurgo.</InfoListItem>
        </InfoList>
      </ContentSection>

      <ContentSection label="Inteligência artificial" title="O processamento visual pode envolver fornecedores contratados.">
        <Prose>
          <p>Quadros selecionados podem ser processados por provedores de inteligência artificial contratados pelo MonitorIA.cam. Dependendo do fornecedor e da infraestrutura utilizada, esse processamento pode envolver transferência internacional de dados.</p>
          <p>A empresa que utiliza o sistema continua responsável por informar adequadamente funcionários, clientes e visitantes sobre o uso de câmeras e pela definição da base legal aplicável ao seu ambiente.</p>
          <Note>Esta página descreve o desenho do produto e não substitui uma análise jurídica específica da operação de cada cliente.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
