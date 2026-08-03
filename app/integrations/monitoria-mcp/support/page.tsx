import Link from "next/link";

export const metadata = { title: "Suporte · MonitorIA MCP" };

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px", background: "#f7f9fb" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", padding: 30, border: "1px solid #dfe6ee", borderRadius: 16, background: "#fff", color: "#31475e", lineHeight: 1.75 }}>
        <Link href="/integrations/monitoria-mcp">← MonitorIA MCP</Link>
        <h1>Suporte</h1>
        <p>Para suporte ao conector, informe o nome do aplicativo de IA, horário aproximado, ferramenta utilizada e mensagem de erro. Não envie tokens OAuth, senhas ou URLs assinadas de evidência.</p>
        <p>Antes da publicação, substitua este parágrafo pelo canal oficial de suporte, e-mail e prazo de atendimento do MonitorIA.</p>
        <p>Endpoint MCP: <code>https://monitoria.cam/mcp</code></p>
      </article>
    </main>
  );
}
