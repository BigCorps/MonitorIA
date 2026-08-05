import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  normalizeNextPath,
} from "@/src/lib/auth";
import {
  createAccount,
  loginWithPassword,
  sendMagicLink,
} from "./actions";
import { AuthButtons } from "./auth-buttons";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function Logo() {
  return (
    <span className="auth-logo-mark" aria-hidden="true">
      <img
        src="/favicon.svg"
        alt=""
        width={25}
        height={25}
      />
    </span>
  );
}

function firstValue(
  value: string | string[] | undefined,
) {
  return typeof value === "string" ? value : null;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const message = firstValue(params.message);
  const error = firstValue(params.error);
  const next = normalizeNextPath(
    firstValue(params.next) ?? "/dashboard",
  );
  const wantsSignup = params.criar === "1";

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Link href="/" className="auth-brand">
          <Logo />
          <span>
            Monitor<span>IA</span>.cam
          </span>
        </Link>

        <div>
          <span className="auth-kicker">
            ACESSO SEGURO
          </span>
          <h1>Sua memória visual começa aqui.</h1>
          <p>
            Entre para configurar locais, câmeras,
            retenção e a linha do tempo pesquisável da
            sua empresa.
          </p>
          <ul>
            <li>
              Dados isolados por organização com RLS
            </li>
            <li>
              Credenciais RTSP permanecem no agente
              local
            </li>
            <li>
              Passkeys, Google, senha e link mágico
            </li>
          </ul>
        </div>

        <small>
          Desenvolvido por BigCorps · Sua câmera vê. O
          MonitorIA lembra.
        </small>
      </section>

      <section className="auth-form-shell">
        <div className="auth-form-card">
          <div className="auth-form-heading">
            <span>MonitorIA.cam</span>
            <h2>
              {wantsSignup
                ? "Criar sua conta"
                : "Entrar no painel"}
            </h2>
            <p>
              {wantsSignup
                ? "O teste grátis começa depois que o Agent estiver pareado e a primeira câmera online."
                : "Escolha uma das formas de acesso autorizadas para sua conta."}
            </p>
          </div>

          {message ? (
            <div className="form-alert success">
              {message}
            </div>
          ) : null}

          {error ? (
            <div className="form-alert error">
              {error}
            </div>
          ) : null}

          {!wantsSignup ? (
            <>
              <AuthButtons next={next} />

              <div className="auth-divider">
                <span>ou use seu e-mail</span>
              </div>
            </>
          ) : null}

          <form
            action={
              wantsSignup
                ? createAccount
                : loginWithPassword
            }
            className="auth-form"
          >
            <input
              type="hidden"
              name="next"
              value={
                wantsSignup ? "/onboarding" : next
              }
            />

            {wantsSignup ? (
              <label>
                <span>Seu nome</span>
                <input
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  minLength={2}
                />
              </label>
            ) : null}

            <label>
              <span>E-mail</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                required
              />
            </label>

            <label>
              <span>Senha</span>
              <input
                name="password"
                type="password"
                autoComplete={
                  wantsSignup
                    ? "new-password"
                    : "current-password"
                }
                placeholder="Mínimo de 8 caracteres"
                minLength={8}
                required
              />
            </label>

            {!wantsSignup ? (
              <div className="auth-inline-row">
                <Link href="/forgot-password">
                  Esqueci minha senha
                </Link>
              </div>
            ) : null}

            <button
              className={`auth-submit ${
                wantsSignup ? "secondary" : ""
              }`}
              type="submit"
            >
              {wantsSignup
                ? "Criar conta"
                : "Entrar com senha"}
            </button>
          </form>

          {!wantsSignup ? (
            <>
              <div className="auth-divider">
                <span>ou</span>
              </div>

              <form
                action={sendMagicLink}
                className="magic-form"
              >
                <input
                  type="hidden"
                  name="next"
                  value={next}
                />
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="E-mail para receber o link"
                  required
                />
                <button type="submit">
                  Enviar link mágico
                </button>
              </form>
            </>
          ) : null}

          <div className="auth-divider">
            <span>
              {wantsSignup
                ? "já possui conta?"
                : "ainda não possui conta?"}
            </span>
          </div>

          <Link
            className="auth-submit secondary"
            href={
              wantsSignup
                ? `/login?next=${encodeURIComponent(
                    next,
                  )}`
                : `/login?criar=1&next=${encodeURIComponent(
                    next,
                  )}`
            }
          >
            {wantsSignup
              ? "Voltar para o login"
              : "Criar uma nova conta"}
          </Link>
        </div>
      </section>
    </main>
  );
}
