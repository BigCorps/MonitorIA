import Link from "next/link";
import { ContentSection, InfoList, InfoListItem, MarketingPage, Note, Prose } from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Resposta a incidentes",
  description: "Processo de comunicação e resposta a incidentes de segurança do MonitorIA.cam.",
  path: "/resposta-a-incidentes",
});

export default function IncidentesPage() {
  return (
    <MarketingPage
      eyebrow="Resposta a incidentes"
      title="Um processo claro para receber, conter e comunicar incidentes."
      lead="A segurança é tratada por etapas verificáveis, com preservação de evidências, avaliação de risco e comunicação responsável."
    >
      <ContentSection label="Processo" title="Da notificação ao encerramento.">
        <InfoList>
          <InfoListItem title="1. Receber e registrar">Relatos são protocolados com horário, sistema afetado e contato do notificante, sem solicitar senhas ou credenciais.</InfoListItem>
          <InfoListItem title="2. Conter e preservar">A equipe revoga acessos quando necessário, limita o impacto e preserva logs e evidências de forma restrita.</InfoListItem>
          <InfoListItem title="3. Avaliar o risco">São analisados confirmação, categorias e volume de dados, titulares afetados, consequências prováveis e medidas já adotadas.</InfoListItem>
          <InfoListItem title="4. Comunicar">Quando houver risco ou dano relevante, o controlador coordena a comunicação à ANPD e aos titulares dentro do prazo regulamentar aplicável.</InfoListItem>
          <InfoListItem title="5. Corrigir e aprender">A causa é tratada, acessos e segredos são rotacionados quando pertinente, e as ações ficam documentadas até o encerramento.</InfoListItem>
        </InfoList>
      </ContentSection>

      <ContentSection label="Canal" title="Como reportar uma suspeita.">
        <Prose>
          <p>Envie um e-mail para <a href={`mailto:${appConfig.legal.securityEmail}?subject=Incidente%20de%20seguran%C3%A7a`}>{appConfig.legal.securityEmail}</a> com o assunto “Incidente de segurança”, ou use o telefone institucional <a href={appConfig.legal.institutionalPhoneHref}>{appConfig.legal.institutionalPhone}</a>. Informe o horário aproximado, a tela ou recurso afetado e como podemos retornar. Não inclua senhas, tokens, chaves RTSP ou imagens sensíveis desnecessárias.</p>
          <p>Clientes autenticados também podem registrar solicitações relacionadas a dados em <Link href="/dashboard/profile">Perfil e empresa</Link>.</p>
          <Note>A confirmação de recebimento não significa que houve violação de dados. A classificação depende da investigação e das responsabilidades de controlador e operador.</Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
