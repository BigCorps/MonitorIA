import Link from "next/link";

export const metadata = { title: "Termos de uso · MonitorIA MCP" };

export default function Page() {
  return (
    <main style={{ minHeight: "100vh", padding: "48px 20px", background: "#f7f9fb" }}>
      <article style={{ maxWidth: 760, margin: "0 auto", padding: 30, border: "1px solid #dfe6ee", borderRadius: 16, background: "#fff", color: "#31475e", lineHeight: 1.75 }}>
        <Link href="/integrations/monitoria-mcp">← MonitorIA MCP</Link>
        <h1>Termos de uso</h1>
        <p>O conector fornece informações derivadas de câmeras e análises probabilísticas. Os resultados devem ser tratados como apoio operacional, não como prova conclusiva.</p>
        <p>É proibido usar o conector para reconhecimento facial, discriminação, perseguição, inferência de atributos sensíveis ou acusação de conduta criminosa sem evidências independentes.</p>
        <p>O usuário é responsável por possuir autorização legítima para instalar e consultar as câmeras e por cumprir as regras aplicáveis de privacidade e proteção de dados.</p>
        <p>Disponibilidade, retenção e precisão dependem da câmera, enquadramento, iluminação, conectividade, plano e qualidade das evidências.</p>
        <p>Este texto deve ser revisado juridicamente antes da submissão pública final.</p>
      </article>
    </main>
  );
}
