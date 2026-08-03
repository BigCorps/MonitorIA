import Link from "next/link";
import styles from "./monitoria-mcp.module.css";

export const metadata = {
  title: "MonitorIA para aplicativos de IA",
  description:
    "Conecte seus dados do MonitorIA ao ChatGPT, Claude e clientes compatíveis com MCP.",
};

const tools = [
  "Locais e câmeras",
  "Eventos e evidências",
  "Sessões operacionais",
  "Estados visuais",
  "Abertura e fechamento",
  "Continuidade de pessoas e veículos",
  "Resumos e comparações",
  "Rotinas, desvios, processos, saúde e alertas",
];

export default function MonitoriaMcpPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img src="/favicon.svg" alt="" width={34} height={34} />
          <strong>MonitorIA.cam</strong>
        </div>
        <Link href="/login">Entrar</Link>
      </header>

      <section className={styles.hero}>
        <span>INTEGRAÇÃO OFICIAL · MCP</span>
        <h1>Converse com suas câmeras no seu aplicativo de IA favorito.</h1>
        <p>
          O conector MonitorIA permite consultar eventos, estados e operações
          diretamente em clientes compatíveis com Model Context Protocol,
          usando login e autorização por organização.
        </p>
        <code>https://monitoria.cam/mcp</code>
      </section>

      <section className={styles.grid}>
        <article>
          <h2>Somente leitura</h2>
          <p>
            O conjunto público v1 não apaga eventos, não altera configurações
            e não controla câmeras.
          </p>
        </article>
        <article>
          <h2>Autorização por empresa</h2>
          <p>
            O usuário escolhe exatamente quais organizações poderão ser
            consultadas pelo aplicativo conectado.
          </p>
        </article>
        <article>
          <h2>Evidência sob demanda</h2>
          <p>
            Imagens só são retornadas quando solicitadas e usam links assinados
            de curta duração.
          </p>
        </article>
      </section>

      <section className={styles.capabilities}>
        <div>
          <span>CAPACIDADES</span>
          <h2>Uma superfície estável para toda a evolução do MonitorIA</h2>
          <p>
            Novas fases enriquecem as mesmas ferramentas, preservando os
            contratos públicos usados pelos aplicativos aprovados.
          </p>
        </div>
        <ul>
          {tools.map((tool) => (
            <li key={tool}>{tool}</li>
          ))}
        </ul>
      </section>

      <footer className={styles.footer}>
        <Link href="/integrations/monitoria-mcp/privacy">Privacidade</Link>
        <Link href="/integrations/monitoria-mcp/terms">Termos</Link>
        <Link href="/integrations/monitoria-mcp/support">Suporte</Link>
      </footer>
    </main>
  );
}
