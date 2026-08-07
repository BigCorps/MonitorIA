import Link from "next/link";
import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Política de privacidade",
  description: "Política de privacidade do MonitorIA.cam sobre contas, imagens selecionadas, eventos visuais, medição do site, retenção, fornecedores e direitos dos titulares.",
  path: "/privacidade",
});

export default function PrivacidadePage() {
  return (
    <MarketingPage
      eyebrow="Política de privacidade"
      title="Como o MonitorIA.cam trata dados pessoais e eventos visuais."
      lead="Última atualização: 7 de agosto de 2026. Esta política descreve o tratamento realizado pela BigCorps no fornecimento do MonitorIA.cam."
    >
      <ContentSection label="Política" title="Informações essenciais sobre o tratamento.">
        <Prose>
          <h2>1. Responsável pelo serviço</h2>
          <p>O MonitorIA.cam é fornecido por {appConfig.legal.legalName}, nome fantasia {appConfig.legal.tradeName}, inscrita no CNPJ sob nº {appConfig.legal.taxId}, com endereço em {appConfig.legal.address}.</p>
          <p>O encarregado pelo tratamento de dados é {appConfig.legal.dataOfficer.name}, {appConfig.legal.dataOfficer.role}. Solicitações podem ser enviadas para <a href={`mailto:${appConfig.legal.privacyEmail}`}>{appConfig.legal.privacyEmail}</a> ou pelo telefone <a href={appConfig.legal.dataOfficer.phoneHref}>{appConfig.legal.dataOfficer.phone}</a>. Usuários autenticados também podem registrar e acompanhar protocolos em <Link href="/dashboard/profile">Perfil e empresa</Link>.</p>

          <h2>2. Dados tratados</h2>
          <p>Podemos tratar dados de cadastro e autenticação, informações da organização, configurações de locais e câmeras, registros técnicos do Agent, quadros selecionados de acontecimentos, descrições geradas, eventos estruturados, mensagens enviadas ao assistente e registros de auditoria.</p>

          <h2>3. Dados que permanecem no ambiente do cliente</h2>
          <p>A gravação contínua e as credenciais RTSP permanecem no ambiente local do cliente. O Agent utiliza as credenciais para acessar as câmeras, mas não as envia ao provedor de inteligência artificial.</p>

          <h2>4. Finalidades</h2>
          <p>Os dados são utilizados para autenticar usuários, conectar câmeras, analisar acontecimentos selecionados, organizar eventos, oferecer pesquisa e relatórios, manter segurança, prevenir abuso, prestar suporte e cumprir obrigações legais.</p>

          <h2>5. Inteligência artificial e fornecedores</h2>
          <p>Quadros selecionados e instruções técnicas podem ser enviados a provedores contratados de inteligência artificial. Outros fornecedores podem apoiar hospedagem, banco de dados, envio de e-mails, observabilidade e infraestrutura. A lista vigente está em <Link href="/subprocessadores">Subprocessadores</Link>.</p>

          <h2>6. Medição de uso do site público</h2>
          <p>Nas páginas públicas do site utilizamos o Microsoft Clarity para entender como as pessoas navegam: profundidade de rolagem, cliques, sinais de dificuldade e gravações anônimas da navegação. Essa medição não é aplicada ao painel do cliente. Nenhuma imagem de câmera, evento, credencial ou dado de organização é enviado a essa ferramenta. O tratamento se apoia no legítimo interesse de melhorar o site, e o script é carregado após o restante da página. Bloqueadores de rastreamento impedem a coleta sem prejuízo ao uso do serviço.</p>

          <h2>7. Transferência internacional</h2>
          <p>Alguns fornecedores podem processar ou armazenar dados fora do Brasil. Nesses casos, buscamos utilizar provedores reconhecidos e medidas contratuais e técnicas compatíveis com a natureza do serviço.</p>

          <h2>8. Compartilhamento</h2>
          <p>Não vendemos dados pessoais. O compartilhamento ocorre somente com fornecedores necessários à operação, por instrução do cliente, em operações societárias legítimas ou quando exigido por lei.</p>

          <h2>9. Retenção e exclusão</h2>
          <p>Os prazos variam conforme o tipo de dado, plano, política da organização e necessidade de segurança. Frames temporários possuem prazos menores; metadados e registros operacionais podem ser mantidos por períodos mais longos. Dados podem ser preservados quando necessários ao cumprimento de obrigação legal ou defesa de direitos. Consulte a <Link href="/retencao">Política de retenção e exclusão</Link>.</p>

          <h2>10. Segurança</h2>
          <p>Adotamos controles de autenticação, isolamento por organização, conexões criptografadas, proteção local de credenciais, registros de auditoria e políticas de acesso. Nenhum sistema é totalmente imune a riscos.</p>

          <h2>11. Responsabilidades do cliente</h2>
          <p>A organização que instala câmeras define as finalidades e bases legais do monitoramento em seu ambiente. Ela deve fornecer avisos adequados, restringir acessos, configurar retenção e atender solicitações de titulares relacionadas às imagens captadas sob sua responsabilidade.</p>

          <h2>12. Direitos dos titulares</h2>
          <p>Conforme aplicável, o titular pode solicitar confirmação, acesso, correção, informação sobre compartilhamento, anonimização, bloqueio, eliminação, portabilidade, oposição, revisão e outras medidas previstas na legislação. A identidade e a legitimidade da solicitação podem ser verificadas antes do atendimento.</p>

          <h2>13. Alterações</h2>
          <p>Esta política pode ser atualizada para refletir mudanças no produto, fornecedores ou legislação. A data da versão será atualizada nesta página.</p>

          <Note>Para imagens captadas em estabelecimentos de clientes, a organização responsável pelo local normalmente atua como controladora. A BigCorps atende no papel definido pelo contrato e pelas instruções documentadas.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
