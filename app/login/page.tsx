import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, normalizeNextPath } from "@/src/lib/auth";
import { createAccount, loginWithPassword, sendMagicLink } from "./actions";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function Logo() {
  return (
    <span className="auth-logo-mark" aria-hidden="true">
      <img src="/favicon.svg" alt="" width={25} height={25} />
    </span>
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getAuthenticatedUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const message = typeof params.message === "string" ? params.message : null;
  const error = typeof params.error === "string" ? params.error : null;
  const next = normalizeNextPath(typeof params.next === "string" ? params.next : "/dashboard");

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link href="/" className="auth-brand"><Logo /><span>Monitor<span>IA</span></span></Link>
        <div>
          <span className="auth-kicker">ACESSO SEGURO</span>
          <h1>Sua memória visual começa aqui.</h1>
          <p>Entre para configurar locais, câmeras, retenção e a linha do tempo pesquisável da sua empresa.</p>
          <ul>
            <li>Dados isolados por organização com RLS</li>
            <li>Credenciais RTSP permanecem no agente local</li>
            <li>Frames temporários e metadados por até um ano</li>
          </ul>
        </div>
        <small>Uma solução BigCorps · Sua câmera vê. A IA lembra.</small>
      </section>

      <section className="auth-form-shell">
        <div className="auth-form-card">
          <div className="auth-form-heading">
            <span>MonitorIA v0.3</span>
            <h2>Entrar no painel</h2>
            <p>Use sua senha ou receba um link de acesso por e-mail.</p>
          </div>

          {message ? <div className="form-alert success">{message}</div> : null}
          {error ? <div className="form-alert error">{error}</div> : null}

          <form action={loginWithPassword} className="auth-form">
            <input type="hidden" name="next" value={next} />
            <label>
              <span>E-mail</span>
              <input name="email" type="email" autoComplete="email" placeholder="voce@empresa.com.br" required />
            </label>
            <label>
              <span>Senha</span>
              <input name="password" type="password" autoComplete="current-password" placeholder="Mínimo de 8 caracteres" minLength={8} required />
            </label>
            <div className="auth-inline-row">
              <Link href="/forgot-password">Esqueci minha senha</Link>
            </div>
            <button className="auth-submit" type="submit">Entrar</button>
          </form>

          <div className="auth-divider"><span>ou</span></div>

          <form action={sendMagicLink} className="magic-form">
            <input type="hidden" name="next" value={next} />
            <input name="email" type="email" autoComplete="email" placeholder="E-mail para receber o link" required />
            <button type="submit">Enviar link mágico</button>
          </form>

          <details className="signup-details">
            <summary>Criar uma nova conta</summary>
            <form action={createAccount} className="auth-form signup-form">
              <input type="hidden" name="next" value="/onboarding" />
              <label><span>Seu nome</span><input name="full_name" type="text" autoComplete="name" required minLength={2} /></label>
              <label><span>E-mail</span><input name="email" type="email" autoComplete="email" required /></label>
              <label><span>Senha</span><input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
              <button className="auth-submit secondary" type="submit">Criar conta</button>
            </form>
          </details>
        </div>
      </section>
    </main>
  );
}
