import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Política de privacidade",
  description: "Política de privacidade do MonitorIA.cam sobre contas, imagens selecionadas, eventos visuais, retenção, fornecedores e direitos dos titulares.",
  path: "/privacidade",
});

export default function PrivacidadePage() {
  return (
    <MarketingPage
      eyebrow="Política de privacidade"
      title="Como o MonitorIA.cam trata dados pessoais e eventos visuais."
      lead="Última atualização: 31 de julho de 2026. Esta política descreve o tratamento realizado pela BigCorps no fornecimento do MonitorIA.cam."
    >
      <ContentSection label="Política" title="Informações essenciais sobre o tratamento.">
        <Prose>
          <h2>1. Responsável pelo serviço</h2>
          <p>O MonitorIA.cam é fornecido pela BigCorps. Solicitações relacionadas à privacidade podem ser encaminhadas pelos canais disponíveis na página de contato.</p>

          <h2>2. Dados tratados</h2>
          <p>Podemos tratar dados de cadastro e autenticação, informações da organização, configurações de locais e câmeras, registros técnicos do Agent, quadros selecionados de acontecimentos, descrições geradas, eventos estruturados, mensagens enviadas ao assistente e registros de auditoria.</p>

          <h2>3. Dados que permanecem no ambiente do cliente</h2>
          <p>A gravação contínua e as credenciais RTSP permanecem no ambiente local do cliente. O Agent utiliza as credenciais para acessar as câmeras, mas não as envia ao provedor de inteligência artificial.</p>

          <h2>4. Finalidades</h2>
          <p>Os dados são utilizados para autenticar usuários, conectar câmeras, analisar acontecimentos selecionados, organizar eventos, oferecer pesquisa e relatórios, manter segurança, prevenir abuso, prestar suporte e cumprir obrigações legais.</p>

          <h2>5. Inteligência artificial e fornecedores</h2>
          <p>Quadros selecionados e instruções técnicas podem ser enviados a provedores contratados de inteligência artificial. Outros fornecedores podem apoiar hospedagem, banco de dados, envio de e-mails, observabilidade e infraestrutura.</p>

          <h2>6. Transferência internacional</h2>
          <p>Alguns fornecedores podem processar ou armazenar dados fora do Brasil. Nesses casos, buscamos utilizar provedores reconhecidos e medidas contratuais e técnicas compatíveis com a natureza do serviço.</p>

          <h2>7. Compartilhamento</h2>
          <p>Não vendemos dados pessoais. O compartilhamento ocorre somente com fornecedores necessários à operação, por instrução do cliente, em operações societárias legítimas ou quando exigido por lei.</p>

          <h2>8. Retenção e exclusão</h2>
          <p>Os prazos variam conforme o tipo de dado, plano, política da organização e necessidade de segurança. Frames temporários possuem prazos menores; metadados e registros operacionais podem ser mantidos por períodos mais longos. Dados podem ser preservados quando necessários ao cumprimento de obrigação legal ou defesa de direitos.</p>

          <h2>9. Segurança</h2>
          <p>Adotamos controles de autenticação, isolamento por organização, conexões criptografadas, proteção local de credenciais, registros de auditoria e políticas de acesso. Nenhum sistema é totalmente imune a riscos.</p>

          <h2>10. Responsabilidades do cliente</h2>
          <p>A organização que instala câmeras define as finalidades e bases legais do monitoramento em seu ambiente. Ela deve fornecer avisos adequados, restringir acessos, configurar retenção e atender solicitações de titulares relacionadas às imagens captadas sob sua responsabilidade.</p>

          <h2>11. Direitos dos titulares</h2>
          <p>Conforme aplicável, o titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio, eliminação, portabilidade, revisão e outras medidas previstas na legislação.</p>

          <h2>12. Alterações</h2>
          <p>Esta política pode ser atualizada para refletir mudanças no produto, fornecedores ou legislação. A data da versão será atualizada nesta página.</p>

          <Note>Antes do lançamento comercial amplo, recomenda-se revisão desta política por profissional jurídico com os dados societários completos da BigCorps e os contratos definitivos dos fornecedores.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
