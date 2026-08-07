import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Aviso de área monitorada",
  description: "Modelo de aviso de monitoramento por câmeras para clientes MonitorIA.cam.",
  path: "/aviso-de-monitoramento",
});

export default function AvisoMonitoramentoPage() {
  return (
    <MarketingPage
      eyebrow="Modelo para impressão"
      title="AVISO: ÁREA MONITORADA POR CÂMERAS"
      lead="As imagens podem ser utilizadas para segurança e organização operacional, conforme a política do responsável por este local."
    >
      <ContentSection label="Transparência" title="Informações que o responsável pelo local deve completar.">
        <Prose>
          <h2>Responsável pelo tratamento</h2>
          <p>Empresa: ______________________________________________</p>
          <p>Contato de privacidade: _________________________________</p>

          <h2>Finalidades</h2>
          <p>Proteção de pessoas e patrimônio, apuração de ocorrências e, quando informado e legítimo, análise operacional do ambiente.</p>

          <h2>Seus direitos</h2>
          <p>Para informações sobre acesso, retenção, compartilhamento ou exercício de direitos, procure o contato acima. O responsável pelo local define as finalidades e atende solicitações sobre as imagens captadas.</p>

          <h2>Limites do MonitorIA.cam</h2>
          <p>A versão atual não usa reconhecimento facial, embedding biométrico, identificação civil automática nem leitura avançada de placas.</p>

          <Note>Imprima esta página pelo navegador e substitua os campos em branco pelos dados do controlador. O aviso deve ficar visível antes da entrada na área monitorada e ser adaptado à operação e à orientação jurídica do cliente.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
