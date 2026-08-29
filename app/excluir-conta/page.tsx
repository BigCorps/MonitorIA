import Link from "next/link";
import {
  ContentSection,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

/** Página pública e acessível sem login para solicitações de conta e dados. */
export const metadata = createPageMetadata({
  title: "Excluir conta e dados",
  description:
    "Como solicitar a exclusão da sua conta e dos seus dados no MonitorIA.cam, o que é apagado, o que pode ser mantido e como acompanhar o pedido.",
  path: "/excluir-conta",
});

export default function ExcluirContaPage() {
  return (
    <MarketingPage
      eyebrow="Exclusão de conta e dados"
      title="Como excluir sua conta e seus dados do MonitorIA."
      lead={`O ${appConfig.productName} é fornecido por ${appConfig.legal.legalName}. Você pode pedir a exclusão da sua conta e dos seus dados a qualquer momento, sem precisar justificar.`}
    >
      <ContentSection label="Pelo painel" title="Como pedir, passo a passo.">
        <Prose>
          <p>Se você consegue entrar na sua conta, este é o caminho mais rápido:</p>
          <ol>
            <li>
              Entre em <a href={`${appConfig.url}/login`}>{appConfig.domain}/login</a>
            </li>
            <li>No menu lateral, abra <strong>Perfil e empresa</strong></li>
            <li>Desça até a seção <strong>Privacidade</strong></li>
            <li>Em tipo de solicitação, escolha <strong>Exclusão</strong></li>
            <li>
              Em abrangência, escolha o que deseja apagar:
              <ul>
                <li><strong>Conta</strong> — seus dados de cadastro e acesso</li>
                <li><strong>Monitoramento</strong> — acontecimentos, imagens e vídeos das câmeras</li>
                <li><strong>Tudo</strong> — conta e monitoramento</li>
              </ul>
            </li>
            <li>
              Descreva o pedido e envie. Você recebe um número de protocolo e
              pode acompanhar o andamento na mesma tela.
            </li>
          </ol>

          <h2>Se você não consegue entrar</h2>
          <p>
            Escreva para <a href={`mailto:${appConfig.legal.privacyEmail}`}>
              {appConfig.legal.privacyEmail}
            </a>{" "}
            ou use o contato institucional {" "}
            <a href={appConfig.legal.institutionalPhoneHref}>
              {appConfig.legal.institutionalPhone}
            </a>, informando o e-mail cadastrado. Podemos pedir confirmação de
            identidade e legitimidade antes de executar a exclusão.
          </p>
        </Prose>
      </ContentSection>

      <ContentSection label="O que acontece" title="O que é apagado e o que pode precisar ser mantido.">
        <Prose>
          <h2>Dados elegíveis à exclusão</h2>
          <ul>
            <li>Dados de cadastro e acesso que não precisem ser preservados</li>
            <li>Acontecimentos registrados pelas câmeras</li>
            <li>Imagens e vídeos guardados desses acontecimentos</li>
            <li>Configurações de locais, câmeras e perfis operacionais</li>
            <li>Conversas com o Assistente</li>
          </ul>

          <h2>Dados que podem ser mantidos</h2>
          <p>
            Alguns registros podem precisar ser preservados pelo período
            necessário para obrigação legal, segurança, prevenção de fraude,
            faturamento, auditoria ou defesa de direitos. Quando isso ocorrer, o
            escopo é limitado à finalidade de preservação e deixa de ser usado na
            operação normal da conta.
          </p>
          <ul>
            <li>Faturas, comprovantes e registros necessários a obrigações fiscais</li>
            <li>Registros de segurança e acesso sujeitos a prazo legal aplicável</li>
            <li>Registros necessários a exercício regular de direitos ou disputa</li>
          </ul>

          <Note>
            A gravação contínua das câmeras fica no DVR, NVR ou computador do
            cliente. Ela não é apagada por uma solicitação ao MonitorIA porque não
            está armazenada na nuvem do MonitorIA.
          </Note>
        </Prose>
      </ContentSection>

      <ContentSection label="Prazo" title="Acompanhamento e resposta.">
        <Prose>
          <p>
            Nosso compromisso operacional é responder às solicitações de
            privacidade em até <strong>15 dias</strong>. Alguns pedidos podem
            exigir confirmação de identidade, delimitação de escopo ou seguir um
            prazo específico previsto na legislação aplicável.
          </p>
          <p>
            Você recebe confirmação quando a solicitação é concluída ou quando
            precisamos de informações adicionais para tratá-la com segurança.
          </p>

          <h2>Quem procurar</h2>
          <p>
            Encarregado pelo tratamento de dados: {appConfig.legal.dataOfficer.name},{" "}
            {appConfig.legal.dataOfficer.role}.
          </p>
          <p>
            {appConfig.legal.legalName} — CNPJ {appConfig.legal.taxId} — {" "}
            {appConfig.legal.address}.
          </p>
          <p>
            Veja também a <Link href="/privacidade">política de privacidade</Link>,
            a <Link href="/retencao">política de retenção</Link> e os {" "}
            <Link href="/termos">termos de uso</Link>.
          </p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
