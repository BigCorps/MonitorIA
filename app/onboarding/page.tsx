import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
} from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  readOnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  createFirstSite,
  createWorkspace,
} from "./actions";

export const metadata = {
  title: "Configuração inicial",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<
    Record<
      string,
      string | string[] | undefined
    >
  >;
};

const timezones = [
  [
    "America/Sao_Paulo",
    "Brasília / São Paulo",
  ],
  ["America/Manaus", "Manaus"],
  ["America/Cuiaba", "Cuiabá"],
  ["America/Rio_Branco", "Rio Branco"],
  [
    "America/Noronha",
    "Fernando de Noronha",
  ],
];

export default async function OnboardingPage({
  searchParams,
}: Props) {
  const user =
    await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);
  const sites = organization
    ? await getOrganizationSites(
        organization.id,
      )
    : [];

  if (organization && sites.length > 0) {
    redirect("/dashboard");
  }

  const intake = readOnboardingIntake(
    user.user_metadata,
  );
  const params = await searchParams;
  const error =
    typeof params.error === "string"
      ? params.error
      : null;
  const action = organization
    ? createFirstSite
    : createWorkspace;
  const currentUserEmail =
    user.email ?? "usuário autenticado";

  const hasGuidedIntake =
    Boolean(intake.organizationName) ||
    Boolean(intake.siteName);

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-progress">
          <span className="active">1</span>
          <i />
          <span>2</span>
          <i />
          <span>3</span>
        </div>

        <span className="auth-kicker">
          CONFIGURAÇÃO INICIAL
        </span>

        <h1>
          {organization
            ? "Confirme o primeiro local"
            : hasGuidedIntake
              ? "Só confirme os dados e continue"
              : "Vamos preparar o MonitorIA para o seu negócio"}
        </h1>

        <p>
          {organization
            ? `A empresa ${organization.name} está criada. Agora confirme o local onde o MonitorIA será instalado.`
            : hasGuidedIntake
              ? "As respostas do seu cadastro já vieram para cá. Você pode corrigir qualquer informação antes de continuar."
              : "Primeiro informe sua empresa e o local. A câmera só receberá um nome depois que o MonitorIA encontrá-la de verdade na sua rede."}
        </p>

        {error ? (
          <div className="form-alert error">
            {error}
          </div>
        ) : null}

        {hasGuidedIntake ? (
          <div className="onboarding-note">
            <strong>
              Respostas já salvas
            </strong>
            <span>
              Tipo de negócio:{" "}
              <strong>
                {intake.industry}
              </strong>
            </span>
            <span>
              Câmeras informadas:{" "}
              <strong>
                {intake.cameraCount}
              </strong>
            </span>
            <span>
              Essa quantidade será reaproveitada
              quando o MonitorIA procurar as
              câmeras.
            </span>
          </div>
        ) : null}

        <div className="onboarding-note">
          <strong>
            Você está entrando por esta conta
          </strong>
          <span>
            Você está conectado como{" "}
            <strong>
              {currentUserEmail}
            </strong>
            .
          </span>
          <span>
            Se o seu cadastro estiver em outro
            e-mail, entre novamente com a conta
            certa.
          </span>

          <form
            action="/auth/signout"
            method="post"
            style={{ marginTop: "12px" }}
          >
            <button
              className="auth-submit secondary"
              type="submit"
            >
              Já tenho cadastro — entrar com
              outra conta
            </button>
          </form>
        </div>

        <form
          action={action}
          className="onboarding-form"
        >
          <input
            type="hidden"
            name="industry"
            value={intake.industry}
          />
          <input
            type="hidden"
            name="camera_count_hint"
            value={intake.cameraCount}
          />

          {!organization ? (
            <label>
              <span>Nome da empresa</span>
              <input
                name="organization_name"
                type="text"
                placeholder="Ex.: Mercado São Jorge"
                minLength={2}
                maxLength={160}
                defaultValue={
                  intake.organizationName
                }
                required
              />
            </label>
          ) : null}

          <label>
            <span>Nome do local</span>
            <input
              name="site_name"
              type="text"
              placeholder="Ex.: Loja do centro"
              maxLength={160}
              defaultValue={
                intake.siteName
              }
              required
            />
          </label>

          <label>
            <span>Fuso horário</span>
            <select
              name="timezone"
              defaultValue="America/Sao_Paulo"
            >
              {timezones.map(
                ([value, label]) => (
                  <option
                    value={value}
                    key={value}
                  >
                    {label}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="onboarding-note">
            <strong>
              O que acontece depois?
            </strong>
            <span>
              No painel você seguirá um passo por
              vez: instalar o MonitorIA no
              computador, procurar as câmeras,
              dar nome às câmeras encontradas,
              escolher entre 24 horas grátis ou
              contratação e concluir a
              configuração da imagem.
            </span>
          </div>

          <button
            className="auth-submit"
            type="submit"
          >
            {organization
              ? "Confirmar local e continuar"
              : hasGuidedIntake
                ? "Confirmar e continuar"
                : "Salvar e continuar"}
          </button>
        </form>
      </section>
    </main>
  );
}
