import Link from "next/link";
import { requestPasswordReset } from "./actions";

export const metadata = { title: "Recuperar senha" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="simple-auth-page">
      <section className="simple-auth-card">
        <span className="auth-kicker">RECUPERAÇÃO</span>
        <h1>Redefina sua senha</h1>
        <p>Enviaremos um link seguro para o e-mail cadastrado.</p>
        {message ? <div className="form-alert success">{message}</div> : null}
        {error ? <div className="form-alert error">{error}</div> : null}
        <form action={requestPasswordReset} className="auth-form">
          <label><span>E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
          <button className="auth-submit" type="submit">Enviar link</button>
        </form>
        <Link href="/login" className="simple-back">← Voltar ao login</Link>
      </section>
    </main>
  );
}
