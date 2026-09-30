import Link from "next/link";
import { appConfig } from "@/src/lib/app-config";

export const metadata = { title: "Termos de uso · MonitorIA MCP" };

const sectionStyle = { marginTop: 28 } as const;

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
        <h1>Termos de uso do MonitorIA MCP</h1>
        <p>
          <strong>Última atualização: 30 de setembro de 2026.</strong>
        </p>
        <p>
          Estes termos regulam o uso do conector MonitorIA MCP fornecido por{" "}
          {appConfig.legal.legalName}. Eles complementam os{" "}
          <Link href="/termos">Termos de Uso gerais</Link> do MonitorIA.
        </p>

        <section style={sectionStyle}>
          <h2>1. Finalidade</h2>
          <p>
            O conector permite que um cliente compatível com Model Context
            Protocol consulte, mediante autorização, informações operacionais
            disponíveis na conta MonitorIA do usuário.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>2. Somente leitura</h2>
          <p>
            O conjunto público do MonitorIA MCP é somente leitura. Ele não apaga
            acontecimentos, não altera configurações e não controla câmeras.
            Ações futuras que alterem estado externo, se vierem a existir, deverão
            ser apresentadas e autorizadas separadamente.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>3. Autorização e escopo</h2>
          <p>
            O usuário escolhe quais organizações podem ser consultadas pelo
            cliente conectado. O acesso depende da permanência do usuário como
            membro autorizado da organização e pode ser revogado a qualquer
            momento.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>4. Natureza dos resultados</h2>
          <p>
            O conector fornece informações derivadas de câmeras e análises
            probabilísticas. Resultados sobre pessoas, veículos, continuidade,
            comportamento operacional ou classificações visuais devem ser tratados
            como apoio à consulta e revisão humana, e não como prova conclusiva.
          </p>
          <p>
            O MonitorIA MCP não deve ser usado para reconhecimento facial,
            perseguição, discriminação, acusação de conduta criminosa sem
            evidências independentes ou decisão automática de alto impacto sobre
            uma pessoa.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>5. Evidências visuais</h2>
          <p>
            Imagens e outras evidências visuais podem conter pessoas, veículos e
            informações de ambientes privados. Elas são disponibilizadas somente
            quando solicitadas e por URLs temporárias. O usuário é responsável por
            possuir autorização para consultá-las e por não redistribuí-las de
            forma incompatível com sua finalidade.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>6. Dados restritos e credenciais</h2>
          <p>
            Não use campos de texto do conector para enviar senhas, chaves de API,
            códigos MFA/OTP, informações de cartão, documentos governamentais ou
            outros segredos. O conector não precisa desses dados para executar as
            ferramentas públicas.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>7. Responsabilidade pelo monitoramento</h2>
          <p>
            O usuário e a organização responsável pelas câmeras devem possuir
            autorização legítima para instalar, operar e consultar o ambiente
            monitorado, além de cumprir as regras aplicáveis de privacidade,
            proteção de dados, segurança e retenção.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>8. Disponibilidade e precisão</h2>
          <p>
            Disponibilidade, retenção e precisão dependem da câmera,
            enquadramento, iluminação, conectividade, plano, configuração e
            qualidade das evidências. O serviço pode apresentar indisponibilidades
            ou resultados incompletos.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>9. Privacidade</h2>
          <p>
            As categorias de dados tratados, finalidades, destinatários,
            retenção e controles do usuário estão detalhados na{" "}
            <Link href="/integrations/monitoria-mcp/privacy">
              Política de Privacidade do MonitorIA MCP
            </Link>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2>10. Contato</h2>
          <p>
            Para suporte ou questões sobre estes termos, utilize{" "}
            <Link href="/integrations/monitoria-mcp/support">Suporte</Link> ou
            escreva para{" "}
            <a href={`mailto:${appConfig.legal.legalEmail}`}>
              {appConfig.legal.legalEmail}
            </a>.
          </p>
        </section>
      </article>
    </main>
  );
}
