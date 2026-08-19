import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  getAuthenticatedUser,
  normalizeNextPath,
} from "@/src/lib/auth";
import {
  loginWithPassword,
  sendMagicLink,
} from "./actions";
import { AuthButtons } from "./auth-buttons";
import { SignupWizard } from "./signup-wizard";
import { appConfig } from "@/src/lib/app-config";
import {
  PASSKEY_LOGIN_HINT_COOKIE,
} from "@/src/lib/passkey-login-hint";
import loginStyles from "./login-page.module.css";

export const metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<
    Record<
      string,
      string | string[] | undefined
    >
  >;
};

function Logo() {
  return (
    <span
      className="auth-logo-mark"
      aria-hidden="true"
    >
      <img
        src="/favicon.svg"
        alt=""
        width={25}
        height={25}
      />
    </span>
  );
}

function MobileBrand() {
  return (
    <Link
      href="/"
      className={loginStyles.mobileBrand}
      aria-label="MonitorIA.cam — página inicial"
    >
      <img
        src="/favicon.svg"
        alt=""
        width={30}
        height={30}
      />
      <span>
        Monitor<em>IA</em>.cam
      </span>
    </Link>
  );
}

function firstValue(
  value:
    | string
    | string[]
    | undefined,
) {
  return typeof value === "string"
    ? value
    : null;
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
    firstValue(params.next) ??
      "/dashboard",
  );
  const wantsSignup =
    params.criar === "1";

  const cookieStore = await cookies();
  const showPasskey =
    cookieStore.get(
      PASSKEY_LOGIN_HINT_COOKIE,
    )?.value === "1";

  return (
    <main
      className={`auth-page ${loginStyles.page}`}
    >
      <section
        className={`auth-intro ${loginStyles.intro}`}
      >
        <Link
          href="/"
          className="auth-brand"
        >
          <Logo />
          <span>
            Monitor<span>IA</span>.cam
          </span>
        </Link>

        <div>
          <span className="auth-kicker">
            ACESSO SEGURO
          </span>
          <h1>
            Sua memória visual começa aqui.
          </h1>
          <p>
            Entre para configurar seus locais,
            suas câmeras e por quanto tempo cada
            coisa fica guardada.
          </p>
          <ul>
            <li>
              Os dados de cada empresa ficam
              separados
            </li>
            <li>
              As senhas das câmeras não saem do
              seu computador
            </li>
            <li>
              Entre com Google, senha ou link no
              e-mail
            </li>
          </ul>
        </div>

        <small>
          Desenvolvido por {appConfig.company} ·{" "}
          {appConfig.slogan}
        </small>
      </section>

      <section
        className={`auth-form-shell ${loginStyles.formShell}`}
      >
        <div
          className={`auth-form-card ${loginStyles.formCard}`}
        >
          <MobileBrand />

          <div className="auth-form-heading">
            <span
              className={
                loginStyles.desktopKicker
              }
            >
              MonitorIA.cam
            </span>
            <h2>
              {wantsSignup
                ? "Começar seu teste grátis"
                : "Entrar no painel"}
            </h2>
            <p>
              {wantsSignup
                ? "Vamos fazer três passos rápidos e deixar seu primeiro acesso preparado."
                : "Como você prefere entrar?"}
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

          {wantsSignup ? (
            <SignupWizard />
          ) : (
            <>
              <AuthButtons
                next={next}
                showPasskey={showPasskey}
              />

              <div className="auth-divider">
                <span>ou use seu e-mail</span>
              </div>

              <form
                action={loginWithPassword}
                className="auth-form"
              >
                <input
                  type="hidden"
                  name="next"
                  value={next}
                />

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
                    autoComplete="current-password"
                    placeholder="Mínimo de 8 caracteres"
                    minLength={8}
                    required
                  />
                </label>

                <div className="auth-inline-row">
                  <Link href="/forgot-password">
                    Esqueci minha senha
                  </Link>
                </div>

                <button
                  className="auth-submit"
                  type="submit"
                >
                  Entrar com senha
                </button>
              </form>

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
                  placeholder="Seu e-mail para receber o link"
                  required
                />
                <button type="submit">
                  Enviar link de acesso
                </button>
              </form>
            </>
          )}

          <div className="auth-divider">
            <span>
              {wantsSignup
                ? "já possui conta?"
                : "ainda não possui conta?"}
            </span>
          </div>

          <Link
            className={loginStyles.switchLink}
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
