import { ContentSection, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Adendo de tratamento de dados",
  description: "Base pública do adendo de tratamento de dados do MonitorIA.cam.",
  path: "/dpa",
});

export default function DpaPage() {
  return (
    <MarketingPage
      eyebrow="DPA"
      title="Adendo de tratamento de dados do MonitorIA.cam."
      lead="Versão-base de 7 de agosto de 2026. Este adendo passa a integrar o contrato somente quando aceito ou incorporado pelas partes."
    >
      <ContentSection label="Condições" title="Papéis, instruções e controles.">
        <Prose>
          <h2>1. Identificação da operadora</h2>
          <p>{appConfig.legal.legalName}, nome fantasia {appConfig.legal.tradeName}, CNPJ {appConfig.legal.taxId}, estabelecida em {appConfig.legal.address}, representada por {appConfig.legal.legalRepresentative.name}, {appConfig.legal.legalRepresentative.role}. Contato: <a href={`mailto:${appConfig.legal.legalEmail}`}>{appConfig.legal.legalEmail}</a>.</p>

          <h2>2. Papéis</h2>
          <p>Para imagens e informações do ambiente monitorado, o cliente normalmente atua como controlador e a BigCorps como operadora, limitada às instruções documentadas e às funções contratadas. Cada parte pode atuar como controladora independente sobre dados necessários às próprias obrigações legais, segurança e faturamento.</p>

          <h2>3. Objeto e duração</h2>
          <p>O tratamento abrange hospedagem, análise visual selecionada, organização de eventos, pesquisa, relatórios, suporte e segurança durante a vigência do serviço e o período de retenção aplicável.</p>

          <h2>4. Categorias</h2>
          <p>Podem ser tratados dados de usuários, registros técnicos, imagens selecionadas, descrições de acontecimentos, horários, locais, atividades operacionais e evidências relacionadas. Reconhecimento facial, embedding biométrico, identidade civil e leitura avançada de placas não fazem parte da versão atual.</p>

          <h2>5. Instruções e confidencialidade</h2>
          <p>A BigCorps tratará dados conforme o contrato, as configurações e as instruções lícitas do cliente. Pessoas autorizadas ficam sujeitas a deveres de confidencialidade e acesso mínimo necessário.</p>

          <h2>6. Segurança</h2>
          <p>São aplicados isolamento por organização, autenticação, RLS, URLs assinadas e temporárias, rate limit, auditoria, retenção configurável e proteção de segredos. O cliente protege o Agent, a rede, as câmeras e as credenciais locais.</p>

          <h2>7. Subprocessadores e transferência</h2>
          <p>A BigCorps pode utilizar os fornecedores publicados na página de subprocessadores. Transferências internacionais devem adotar mecanismo válido e salvaguardas compatíveis com a regulamentação da ANPD.</p>

          <h2>8. Titulares e incidentes</h2>
          <p>A BigCorps prestará assistência razoável ao cliente para atender direitos e avaliar incidentes. Comunicações à ANPD e aos titulares cabem ao controlador, com a cooperação da operadora e observância dos prazos aplicáveis.</p>

          <h2>9. Término</h2>
          <p>Ao término, os dados são devolvidos, exportados ou eliminados segundo a política de retenção, ressalvadas obrigações legais, preservações válidas e o ciclo protegido de backups.</p>

          <h2>10. Auditoria</h2>
          <p>Informações razoáveis sobre os controles podem ser fornecidas sob confidencialidade. Auditorias presenciais dependem de escopo, aviso, segurança de terceiros e acordo comercial.</p>

          <h2>11. Contato e foro</h2>
          <p>O contato de privacidade é <a href={`mailto:${appConfig.legal.privacyEmail}`}>{appConfig.legal.privacyEmail}</a>, sob responsabilidade do encarregado {appConfig.legal.dataOfficer.name}. Fica eleito o {appConfig.legal.jurisdiction}, observadas as regras legais de competência aplicáveis.</p>

          <Note>O cliente é identificado no instrumento de contratação. Escopo, categorias específicas, duração, instruções e condições comerciais podem constar em proposta ou anexo próprio.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
