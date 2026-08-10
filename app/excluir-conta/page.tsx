import Link from "next/link";
import {
  ContentSection,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

/**
 * Página pública de exclusão de conta e dados.
 *
 * Exigida pelo Google Play: o link informado no formulário de Segurança dos
 * Dados aparece na ficha do aplicativo e precisa ser acessível SEM login. O
 * revisor da Play não tem conta no MonitorIA — apontar para
 * /dashboard/profile faria a análise ser reprovada, porque ele cairia na
 * tela de entrada.
 *
 * A Play exige três coisas no texto, e as três estão aqui:
 *   1. o nome do aplicativo e do desenvolvedor
 *   2. as etapas que o usuário precisa seguir
 *   3. quais dados são excluídos, quais são mantidos e por quanto tempo
 *
 * Use este endereço nos DOIS campos do formulário: "URL para exclusão de
 * contas" e "URL para exclusão de dados".
 */
export const metadata = createPageMetadata({
  title: "Excluir conta e dados",
  description:
    "Como solicitar a exclusão da sua conta e dos seus dados no MonitorIA.cam, o que é apagado, o que é mantido por obrigação legal e em quanto tempo.",
  path: "/excluir-conta",
});

export default function ExcluirContaPage() {
  return (
    <MarketingPage
      eyebrow="Exclusão de conta e dados"
      title="Como excluir sua conta e seus dados do MonitorIA."
      lead={`O ${appConfig.productName} é fornecido por ${appConfig.legal.legalName}. Você pode pedir a exclusão da sua conta e dos seus dados a qualquer momento, sem precisar justificar.`}
    >
      <ContentSection
        label="Pelo painel"
        title="Como pedir, passo a passo."
      >
        <Prose>
          <p>
            Se você consegue entrar na sua conta, este é o caminho mais rápido:
          </p>

          <ol>
            <li>
              Entre em{" "}
              <a href={`${appConfig.url}/login`}>{appConfig.domain}/login</a>
            </li>
            <li>
              No menu lateral, abra <strong>Perfil e empresa</strong>
            </li>
            <li>
              Desça até a seção <strong>Privacidade</strong>
            </li>
            <li>
              Em tipo de solicitação, escolha <strong>Exclusão</strong>
            </li>
            <li>
              Em abrangência, escolha o que deseja apagar:
              <ul>
                <li>
                  <strong>Conta</strong> — seus dados de cadastro e acesso
                </li>
                <li>
                  <strong>Monitoramento</strong> — acontecimentos, imagens e
                  vídeos das câmeras
                </li>
                <li>
                  <strong>Tudo</strong> — conta e monitoramento
                </li>
              </ul>
            </li>
            <li>
              Descreva o pedido em uma linha e envie. Você recebe um número de
              protocolo e pode acompanhar o andamento na mesma tela
            </li>
          </ol>

          <h2>Se você não consegue entrar</h2>
          <p>
            Escreva para{" "}
            <a href={`mailto:${appConfig.legal.privacyEmail}`}>
              {appConfig.legal.privacyEmail}
            </a>{" "}
            ou chame no WhatsApp pelo{" "}
            <a href={appConfig.legal.institutionalPhoneHref}>
              {appConfig.legal.institutionalPhone}
            </a>
            , informando o e-mail cadastrado. Podemos pedir uma confirmação de
            identidade antes de apagar qualquer coisa — é uma proteção para
            você, para que ninguém apague a sua conta se passando por você.
          </p>
        </Prose>
      </ContentSection>

      <ContentSection
        label="O que acontece"
        title="O que é apagado e o que precisa ser mantido."
      >
        <Prose>
          <h2>Apagamos</h2>
          <ul>
            <li>Seus dados de cadastro e acesso</li>
            <li>Os acontecimentos registrados pelas suas câmeras</li>
            <li>As imagens e os vídeos guardados desses acontecimentos</li>
            <li>As configurações de locais, câmeras e equipe</li>
            <li>As conversas com o Assistente</li>
          </ul>

          <h2>Mantemos, por obrigação legal</h2>
          <p>
            A legislação brasileira obriga a guardar alguns registros mesmo
            depois do encerramento da conta. Eles ficam separados, não são
            usados para nenhuma outra finalidade, e são apagados quando o
            prazo legal termina:
          </p>
          <ul>
            <li>
              <strong>Faturas e comprovantes de pagamento</strong>, pela
              legislação fiscal
            </li>
            <li>
              <strong>Registros de acesso ao sistema</strong>, pelo prazo
              previsto no Marco Civil da Internet
            </li>
          </ul>

          <Note>
            A gravação contínua das suas câmeras nunca esteve conosco. Ela fica
            no seu DVR, no seu NVR ou no computador da loja, e continua lá
            depois da exclusão. Se quiser apagá-la, faça pelo próprio
            equipamento.
          </Note>
        </Prose>
      </ContentSection>

      <ContentSection label="Prazo" title="Em quanto tempo.">
        <Prose>
          <p>
            Respondemos em até <strong>15 dias</strong> a partir do pedido, que
            é o prazo previsto na Lei Geral de Proteção de Dados. Na maioria
            dos casos é bem mais rápido.
          </p>
          <p>
            Você recebe uma confirmação quando a exclusão for concluída. Se
            precisarmos de alguma informação para confirmar sua identidade,
            entramos em contato pelo e-mail cadastrado.
          </p>

          <h2>Quem procurar</h2>
          <p>
            Encarregado pelo tratamento de dados:{" "}
            {appConfig.legal.dataOfficer.name},{" "}
            {appConfig.legal.dataOfficer.role}.
          </p>
          <p>
            {appConfig.legal.legalName} — CNPJ {appConfig.legal.taxId} —{" "}
            {appConfig.legal.address}.
          </p>
          <p>
            Veja também a{" "}
            <Link href="/privacidade">política de privacidade</Link> e os{" "}
            <Link href="/termos">termos de uso</Link>.
          </p>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
