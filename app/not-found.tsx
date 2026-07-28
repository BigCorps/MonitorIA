import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <span>404</span>
      <h1>Página não encontrada</h1>
      <p>O endereço não existe ou ainda não foi publicado no MonitorIA.</p>
      <Link className="button button-primary" href="/">Voltar ao início</Link>
    </main>
  );
}
