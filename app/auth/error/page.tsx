import Link from "next/link";

export const metadata = { title: "Erro de autenticação" };

export default function AuthErrorPage() {
  return (
    <main className="auth-error-page">
      <span>AUTH_ERROR</span>
      <h1>O link não pôde ser validado.</h1>
      <p>Ele pode ter expirado ou já ter sido utilizado. Solicite um novo link de acesso.</p>
      <Link href="/login" className="button button-primary">Voltar ao login</Link>
    </main>
  );
}
