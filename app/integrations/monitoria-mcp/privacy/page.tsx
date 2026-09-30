import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";

export const metadata = {
  title: "Privacidade · MonitorIA MCP",
  description:
    "Política de privacidade específica do conector MonitorIA MCP, incluindo dados tratados, finalidades, destinatários, retenção e controles do usuário.",
};

const sectionStyle = { marginTop: 30 } as const;
const listStyle = { paddingLeft: 22 } as const;

export default function Page() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 20px",
        background: "#f7f9fb",
      }}
    >
      <article
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: 30,
          border: "1px solid #dfe6ee",
          borderRadius: 16,
          background: "#fff",
          color: "#31475e",
          lineHeight: 1.75,
        }}
      >
        <Link href="/integrations/monitoria-mcp">← MonitorIA MCP</Link>

        <h1>Privacidade do MonitorIA MCP</h1>
        <p>
          <strong>Última atualização: 30 de setembro de 2026.</strong>
        </p>
        <p>
          Esta política explica especificamente como o conector MonitorIA MCP
          trata dados quando uma pessoa conecta sua conta MonitorIA a um cliente
          compatível com Model Context Protocol, como o ChatGPT. Ela complementa
          a <Link href="/privacidade">Política de Privacidade geral</Link> e a{" "}
          <Link href="/retencao">Política de Retenção e Exclusão</Link> do
          MonitorIA.
        </p>

        <section style={sectionStyle}>
          <h2>1. Responsável e contato</h2>
          <p>
            O conector é fornecido por {appConfig.legal.legalName}, nome
            fantasia {appConfig.legal.tradeName}, CNPJ {appConfig.legal.taxId}.
            Dúvidas e solicitações de privacidade podem ser enviadas para{" "}
            <a href={`mailto:${appConfig.legal.privacyEmail}`}>
              {appConfig.legal.privacyEmail}
            </a>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>2. Dados que o conector pode tratar</h2>
          <p>
            O conector trata somente os dados necessários para autenticar a
            conexão, aplicar as permissões escolhidas e responder às ferramentas
            solicitadas pelo usuário ou pelo cliente MCP.
          </p>
          <ul style={listStyle}>
            <li>
              <strong>Conta e autorização:</strong> identificador da conta
              MonitorIA, e-mail quando presente no token de autenticação,
              identificador e nome do cliente MCP, organizações autorizadas,
              função do usuário na organização, escopos aprovados e estado da
              concessão OAuth.
            </li>
            <li>
              <strong>Entradas das ferramentas:</strong> organização, local,
              câmera, evento ou sessão selecionados, intervalos de data e hora,
              filtros de pesquisa, limites de resultados e outros parâmetros
              necessários à consulta. Na ferramenta <code>ask_monitoria</code>,
              a pergunta enviada à ferramenta também é processada para selecionar
              a consulta operacional adequada.
            </li>
            <li>
              <strong>Dados operacionais do MonitorIA:</strong> informações de
              locais e câmeras, acontecimentos, horários, descrições, estados
              visuais, sessões operacionais, pessoas e veículos observados,
              continuidade probabilística, rotinas, processos, alertas e
              insights disponíveis à organização autorizada.
            </li>
            <li>
              <strong>Evidências visuais:</strong> quando o usuário ou o cliente
              solicita explicitamente evidências, a ferramenta pode retornar
              imagens ou outras evidências disponíveis por URL assinada e
              temporária.
            </li>
            <li>
              <strong>Auditoria técnica do MCP:</strong> identificador do usuário,
              cliente MCP, organização, nome da ferramenta, status da execução,
              duração, quantidade de resultados, hash criptográfico dos argumentos,
              código resumido de erro quando aplicável e horário da execução.
            </li>
            <li>
              <strong>Dados técnicos de rede e segurança:</strong> provedores de
              infraestrutura podem processar informações técnicas necessárias
              para entregar e proteger a conexão, como endereço IP, cabeçalhos de
              rede e registros de segurança.
            </li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2>3. O que o conector não busca por conta própria</h2>
          <p>
            O servidor MCP não solicita, reconstrói nem importa o histórico
            completo da conversa do ChatGPT ou de outro cliente. Ele recebe
            somente os argumentos que o cliente escolhe enviar para a ferramenta
            chamada.
          </p>
          <p>
            As ferramentas públicas do MonitorIA MCP não são projetadas para
            solicitar senhas de câmera, chaves de API, códigos MFA/OTP, dados de
            cartão de pagamento, números de documentos governamentais ou outras
            credenciais secretas. Não envie esse tipo de informação como texto
            livre para as ferramentas.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>4. Finalidades de uso</h2>
          <p>Usamos os dados acima para:</p>
          <ul style={listStyle}>
            <li>autenticar o usuário e validar o cliente MCP;</li>
            <li>limitar cada consulta às organizações expressamente autorizadas;</li>
            <li>
              executar a ferramenta solicitada e retornar somente os resultados
              necessários à pergunta;
            </li>
            <li>
              disponibilizar evidências visuais apenas quando explicitamente
              solicitadas;
            </li>
            <li>
              manter segurança, prevenção de abuso, disponibilidade, diagnóstico
              e auditoria do serviço;
            </li>
            <li>
              atender solicitações de suporte, privacidade e obrigações legais
              aplicáveis.
            </li>
          </ul>
          <p>
            O conjunto público do MonitorIA MCP é somente leitura: ele não apaga
            acontecimentos, não altera configurações e não controla câmeras.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>5. Dados devolvidos ao cliente conectado</h2>
          <p>
            O cliente MCP recebe somente os resultados correspondentes à
            ferramenta executada e ao escopo autorizado. Dependendo da consulta,
            isso pode incluir descrições de acontecimentos, horários, estados,
            sessões, pessoas e veículos observados, estimativas operacionais e
            identificadores necessários para continuar uma consulta relacionada.
          </p>
          <p>
            Evidências visuais não são anexadas automaticamente a todas as
            respostas. Elas são fornecidas somente pela ferramenta específica de
            evidências e por links temporários.
          </p>
          <p>
            Correspondências de pessoas e veículos são probabilísticas e não
            representam identidade civil. O MonitorIA não usa reconhecimento
            facial no conector.
          </p>
          <p>
            Quando uma organização habilita explicitamente um recurso experimental
            de proteção da infância em uma câmera, um acontecimento pode incluir
            uma classificação visual ampla como “provável criança”, “provável
            adulto” ou “não determinado”, com nível de confiança e indicação de
            revisão humana. Esse recurso não determina idade exata, maioridade
            legal, identidade, parentesco, abandono, abuso ou vulnerabilidade.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>6. Destinatários e compartilhamento</h2>
          <p>Os dados podem ser disponibilizados às seguintes categorias:</p>
          <ul style={listStyle}>
            <li>
              <strong>Cliente MCP escolhido pelo usuário:</strong> por exemplo,
              quando a conexão é feita pelo ChatGPT, os dados retornados pela
              ferramenta são entregues à OpenAI para serem usados naquela
              interação conforme os controles, termos e política de privacidade
              aplicáveis ao ChatGPT.
            </li>
            <li>
              <strong>Fornecedores de infraestrutura do MonitorIA:</strong>{" "}
              serviços necessários para autenticação, banco de dados,
              armazenamento, hospedagem, execução do backend, segurança e
              disponibilidade. A relação atual está em{" "}
              <Link href="/subprocessadores">Subprocessadores</Link>.
            </li>
            <li>
              <strong>Autoridades ou terceiros legalmente autorizados:</strong>{" "}
              somente quando necessário para cumprir obrigação legal, ordem
              válida, proteger direitos ou responder a incidente de segurança.
            </li>
          </ul>
          <p>O MonitorIA não vende dados pessoais tratados pelo MCP.</p>
        </section>

        <section style={sectionStyle}>
          <h2>7. Retenção</h2>
          <ul style={listStyle}>
            <li>
              <strong>Entradas e respostas do MCP:</strong> o texto integral dos
              argumentos e o conteúdo integral da resposta não são copiados para
              o registro de auditoria MCP. Eles são processados durante a
              execução da ferramenta. Os dados de origem permanecem sujeitos aos
              prazos próprios do MonitorIA.
            </li>
            <li>
              <strong>Auditoria técnica do MCP:</strong> a política operacional
              atual prevê retenção de até <strong>90 dias</strong> para os
              registros de auditoria da ferramenta, ressalvadas necessidades
              legais, de segurança ou defesa de direitos.
            </li>
            <li>
              <strong>URLs de evidência:</strong> são temporárias. A configuração
              padrão atual é de aproximadamente <strong>5 minutos</strong>, com
              limite técnico entre 1 e 15 minutos.
            </li>
            <li>
              <strong>Concessões OAuth:</strong> permanecem ativas até revogação.
              A revogação interrompe o acesso futuro imediatamente. O registro da
              concessão e sua revogação pode permanecer como histórico de
              segurança e consentimento enquanto a conta existir, até exclusão da
              conta ou atendimento de solicitação de privacidade aplicável.
            </li>
            <li>
              <strong>Dados de origem do MonitorIA:</strong> a referência
              operacional atual é de 3 dias para frames temporários, 365 dias para
              keyframes e metadados de acontecimentos e 30 dias para clipes
              preservados, podendo variar conforme plano, configuração e
              obrigações aplicáveis. Consulte{" "}
              <Link href="/retencao">Retenção e Exclusão</Link>.
            </li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2>8. Controles do usuário</h2>
          <p>O usuário pode:</p>
          <ul style={listStyle}>
            <li>
              escolher quais organizações do MonitorIA autoriza para o cliente
              MCP;
            </li>
            <li>
              revogar a conexão em <strong>Perfil e empresa → Conexões MCP</strong>;
            </li>
            <li>
              desconectar o aplicativo no próprio ChatGPT ou cliente MCP utilizado;
            </li>
            <li>
              deixar de solicitar evidências visuais quando não quiser que uma
              imagem seja entregue ao cliente conectado;
            </li>
            <li>
              solicitar acesso, correção, exclusão e outros direitos aplicáveis
              pelos canais descritos na{" "}
              <Link href="/privacidade">Política de Privacidade</Link> e em{" "}
              <Link href="/excluir-conta">Excluir conta e dados</Link>.
            </li>
          </ul>
          <p>
            Revogar o MonitorIA MCP impede novas consultas pelo grant revogado,
            mesmo que um token previamente emitido ainda não tenha atingido seu
            vencimento técnico.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>9. Segurança e minimização</h2>
          <p>
            O conector usa OAuth, isolamento por organização, um papel dedicado
            de leitura e URLs assinadas temporárias para evidências. As respostas
            são limitadas ao escopo da ferramenta e da organização autorizada.
          </p>
          <p>
            O registro de auditoria armazena um hash dos argumentos em vez de
            copiar a pergunta integral ou os dados retornados. As ferramentas
            também aplicam limites de quantidade de resultados para reduzir
            exposição desnecessária.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>10. Responsabilidade pelo ambiente monitorado</h2>
          <p>
            A organização que opera as câmeras é responsável por possuir
            autorização e finalidade legítimas para o monitoramento, fornecer
            avisos quando aplicáveis, restringir acesso e observar a legislação
            de proteção de dados. O usuário deve consultar pelo MCP apenas dados
            que esteja autorizado a acessar.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>11. Alterações desta política</h2>
          <p>
            Esta política será atualizada quando houver mudança relevante nas
            categorias de dados, finalidades, destinatários, retenção, controles
            do usuário ou comportamento das ferramentas MCP. A data no início da
            página identifica a versão vigente.
          </p>
          <p>
            Para informações adicionais sobre o tratamento realizado pela
            plataforma, consulte a{" "}
            <Link href="/privacidade">Política de Privacidade geral</Link>.
          </p>
        </section>
      </article>
    </main>
  );
}
