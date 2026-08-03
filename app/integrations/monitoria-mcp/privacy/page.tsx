import Link from "next/link";

export const metadata = { title: "Privacidade · MonitorIA MCP" };

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px", background: "#f7f9fb" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", padding: 30, border: "1px solid #dfe6ee", borderRadius: 16, background: "#fff", color: "#31475e", lineHeight: 1.75 }}>
        <Link href="/integrations/monitoria-mcp">← MonitorIA MCP</Link>
        <h1>Privacidade</h1>
        <p>O conector usa a conta MonitorIA do usuário e acessa somente organizações expressamente autorizadas. O conjunto público é somente leitura.</p>
        <p>Consultas podem retornar metadados de câmeras, eventos, estados, sessões e insights operacionais. Imagens são fornecidas apenas mediante solicitação explícita, por URLs assinadas temporárias.</p>
        <p>O MonitorIA registra auditoria técnica com ferramenta, cliente, horário, duração, quantidade de resultados e hash dos argumentos. O texto integral das perguntas e os dados retornados não são gravados nessa auditoria.</p>
        <p>O usuário pode revogar o acesso na área de conexões MCP. A revogação interrompe o acesso às organizações mesmo que o aplicativo ainda possua um token não expirado.</p>
        <p>Este texto deve ser revisado juridicamente antes da submissão pública final.</p>
      </article>
    </main>
  );
}
