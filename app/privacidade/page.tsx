import Link from "next/link";
import {
  ContentSection,
  MarketingPage,
  Note,
  Prose,
} from "@/src/components/marketing/content-page";
import { appConfig } from "@/src/lib/app-config";
import { createPageMetadata } from "@/src/lib/seo";

export const metadata = createPageMetadata({
  title: "Política de privacidade",
  description:
    "Política de privacidade do MonitorIA.cam sobre contas, imagens selecionadas, eventos visuais, inteligência operacional, retenção, fornecedores e direitos dos titulares.",
  path: "/privacidade",
});

export default function PrivacidadePage() {
  return (
    <MarketingPage
      eyebrow="Política de privacidade"
      title="Como o MonitorIA.cam trata dados pessoais e eventos visuais."
      lead="Última atualização: 29 de agosto de 2026. Esta política descreve o tratamento realizado pela BigCorps no fornecimento do MonitorIA.cam."
    >
      <ContentSection label="Política" title="Informações essenciais sobre o tratamento.">
        <Prose>
          <h2>1. Responsável pelo serviço</h2>
          <p>
            O MonitorIA.cam é fornecido por {appConfig.legal.legalName}, nome
            fantasia {appConfig.legal.tradeName}, inscrita no CNPJ sob nº {" "}
            {appConfig.legal.taxId}, com endereço em {appConfig.legal.address}.
          </p>
          <p>
            O encarregado pelo tratamento de dados é {appConfig.legal.dataOfficer.name},{" "}
            {appConfig.legal.dataOfficer.role}. Solicitações podem ser enviadas
            para <a href={`mailto:${appConfig.legal.privacyEmail}`}>
              {appConfig.legal.privacyEmail}
            </a>{" "}
            ou pelo telefone <a href={appConfig.legal.dataOfficer.phoneHref}>
              {appConfig.legal.dataOfficer.phone}
            </a>. Usuários autenticados também podem registrar e acompanhar
            protocolos em <Link href="/dashboard/profile">Perfil e empresa</Link>.
          </p>

          <h2>2. Dados tratados</h2>
          <p>
            Conforme os recursos habilitados, podemos tratar dados de cadastro e
            autenticação, informações da organização e dos locais, configurações
            de câmeras, endereço de rede e dados técnicos do Agent, endereços IP,
            métricas de saúde do computador, quadros selecionados, clipes
            preservados de acontecimentos, descrições e eventos estruturados,
            mensagens enviadas ao assistente, registros de auditoria e dados de
            uso necessários à operação e cobrança.
          </p>
          <p>
            A análise visual pode produzir atributos e inferências como presença,
            zona, ação, cores de roupa, objetos carregados, tipo e cor de veículo,
            horários, papéis operacionais prováveis e indicadores de continuidade.
            Esses resultados podem constituir dados pessoais quando relacionados
            a uma pessoa identificada ou identificável no contexto do cliente.
          </p>

          <h2>3. Gravação contínua e credenciais das câmeras</h2>
          <p>
            A gravação contínua permanece integralmente no ambiente local do
            cliente: DVR, NVR, câmera ou computador onde o MonitorIA está
            instalado. Nós não recebemos nem armazenamos essa gravação integral.
          </p>
          <p>
            Usuários e senhas das câmeras são armazenados de forma durável apenas
            no computador do cliente, protegidos pelos recursos de cofre do
            sistema operacional. Quando o cliente usa a descoberta pelo painel,
            as credenciais necessárias àquela execução trafegam pelos servidores
            somente para chegar ao Agent, permanecem cifradas enquanto aguardam
            processamento e são eliminadas ao término do fluxo. Essas credenciais
            não são enviadas ao provedor de inteligência artificial.
          </p>

          <h2>4. Continuidade e perfis operacionais</h2>
          <p>
            O MonitorIA não usa reconhecimento facial para identificar uma pessoa
            pelo nome nem para descobrir sua identidade civil. Quando o cliente
            habilita recursos de memória curta, continuidade ou inteligência de
            equipe, o sistema pode correlacionar acontecimentos de forma
            probabilística usando características visuais amplas, áreas, horários,
            atividades e contexto operacional. Perfis de equipe podem depender de
            aprovação ou revisão humana. Essas correlações não constituem uma
            confirmação de identidade.
          </p>
          <p>
            Recursos de continuidade de veículos podem comparar características
            visíveis, como tipo, cor, formato, área e proximidade temporal, dentro
            de janelas configuradas. Recursos específicos de placa, quando
            habilitados, devem ser usados pelo cliente de acordo com a finalidade
            e a base legal aplicáveis.
          </p>

          <h2>5. Finalidades</h2>
          <p>
            Os dados são utilizados para autenticar usuários, conectar e manter
            câmeras, detectar e analisar acontecimentos, organizar evidências,
            oferecer pesquisa, relatórios e inteligência operacional, executar o
            assistente, manter segurança e disponibilidade, prevenir abuso,
            prestar suporte, administrar planos e cumprir obrigações legais.
          </p>

          <h2>6. Inteligência artificial e fornecedores</h2>
          <p>
            Quadros selecionados e o contexto necessário à análise podem ser
            enviados a provedores contratados de inteligência artificial. A
            implementação atual usa a OpenAI para rotas generativas de visão e
            para funcionalidades de assistente quando aplicável. O aplicativo usa por padrão o parâmetro técnico <code>store: false</code>
            nas chamadas de visão, solicitando que essas respostas não sejam
            armazenadas pelo provedor para reutilização do aplicativo, salvo se
            uma configuração operacional explícita alterar esse comportamento. O tratamento pelo
            fornecedor continua sujeito aos contratos, políticas e requisitos
            legais aplicáveis ao serviço contratado.
          </p>
          <p>
            Outros fornecedores apoiam hospedagem, banco de dados, armazenamento,
            execução do backend, envio de páginas e observabilidade. Consulte a
            lista vigente em <Link href="/subprocessadores">Subprocessadores</Link>.
          </p>

          <h2>7. Medição de uso do site público</h2>
          <p>
            Nas páginas públicas utilizamos o Microsoft Clarity para entender
            navegação, cliques e sinais de dificuldade. Essa medição não é
            aplicada ao painel autenticado e não recebe imagens de câmeras,
            eventos, credenciais ou dados da organização. Bloqueadores de
            rastreamento podem impedir essa coleta sem prejudicar o uso do
            serviço autenticado.
          </p>

          <h2>8. Transferência internacional e compartilhamento</h2>
          <p>
            Alguns fornecedores podem processar ou armazenar dados fora do
            Brasil. Utilizamos provedores necessários à operação e buscamos
            aplicar medidas contratuais e técnicas compatíveis com a natureza do
            serviço. Não vendemos dados pessoais. O compartilhamento ocorre com
            fornecedores necessários, por instrução do cliente, em operações
            societárias legítimas ou quando exigido por lei.
          </p>

          <h2>8.1. Conexão com assistentes externos</h2>
          <p>
            O MonitorIA oferece, como funcionalidade opcional, conexão com
            assistentes de terceiros — por exemplo ChatGPT e Claude — por meio do
            protocolo MCP (Model Context Protocol). A conexão só existe depois de
            autorização expressa do usuário e concessão das permissões aplicáveis.
          </p>
          <p>
            Enquanto estiver ativa, o assistente autorizado pode consultar dados
            permitidos da organização, como acontecimentos, descrições, horários e
            indicadores. Os dados consultados passam a ser tratados também pelo
            fornecedor escolhido pelo cliente. A autorização pode ser revogada no
            painel, encerrando o acesso futuro pelo grant do MonitorIA.
          </p>

          <h2>9. Retenção e exclusão</h2>
          <p>
            Os prazos dependem da categoria, do plano e da configuração da
            organização. A política operacional atual usa, como referência padrão,
            3 dias para frames temporários, 365 dias para keyframes e metadados e
            30 dias para clipes preservados. A política efetiva do evento fica
            registrada junto aos dados e pode variar conforme o produto contratado.
            Telemetria bruta de saúde do Agent é agregada e normalmente mantida por
            7 dias; agregados horários podem ser mantidos por até 365 dias.
          </p>
          <p>
            Dados podem ser preservados além do prazo normal quando necessários ao
            cumprimento de obrigação legal, prevenção de fraude, segurança ou
            defesa de direitos. Consulte a <Link href="/retencao">
              Política de retenção e exclusão
            </Link> e, para solicitar exclusão, <Link href="/excluir-conta">
              Excluir conta e dados
            </Link>.
          </p>

          <h2>10. Segurança</h2>
          <p>
            Adotamos autenticação, isolamento por organização, conexões
            criptografadas, proteção local de credenciais, hashing de tokens,
            registros de auditoria, controle por função e políticas de acesso.
            Nenhum sistema conectado é totalmente imune a riscos.
          </p>

          <h2>11. Responsabilidades do cliente</h2>
          <p>
            A organização que instala câmeras define as finalidades e bases legais
            do monitoramento em seu ambiente. Ela deve fornecer avisos adequados,
            restringir acessos, configurar retenção e atender solicitações de
            titulares relacionadas às imagens captadas sob sua responsabilidade.
          </p>

          <h2>12. Direitos dos titulares</h2>
          <p>
            Conforme aplicável, o titular pode solicitar confirmação, acesso,
            correção, informação sobre compartilhamento, anonimização, bloqueio,
            eliminação, portabilidade, oposição e outras medidas previstas na
            legislação. Podemos verificar identidade, legitimidade e escopo antes
            de executar uma solicitação que afete dados ou contas.
          </p>
          <p>
            Usuários autenticados podem abrir e acompanhar um protocolo em {" "}
            <Link href="/dashboard/profile">Perfil e empresa</Link>. Quem não
            conseguir acessar a conta pode escrever para {" "}
            <a href={`mailto:${appConfig.legal.privacyEmail}`}>
              {appConfig.legal.privacyEmail}
            </a>. Nosso compromisso operacional é responder às solicitações em até
            15 dias, sem prejuízo de prazos específicos aplicáveis a determinado
            direito ou obrigação legal.
          </p>

          <h2>13. Alterações</h2>
          <p>
            Esta política pode ser atualizada para refletir mudanças no produto,
            fornecedores ou legislação. A data da versão será atualizada nesta
            página.
          </p>

          <Note>
            Para imagens captadas em estabelecimentos de clientes, a organização
            responsável pelo local normalmente define a finalidade do
            monitoramento. A BigCorps trata os dados no papel definido pelo
            contrato, pela legislação e pelas instruções documentadas aplicáveis.
          </Note>
        </Prose>
      </ContentSection>
    </MarketingPage>
  );
}
