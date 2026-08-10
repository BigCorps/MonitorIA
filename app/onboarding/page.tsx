import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
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
    Record<string, string | string[] | undefined>
  >;
};

const timezones = [
  ["America/Sao_Paulo", "Brasília / São Paulo"],
  ["America/Manaus", "Manaus"],
  ["America/Cuiaba", "Cuiabá"],
  ["America/Rio_Branco", "Rio Branco"],
  ["America/Noronha", "Fernando de Noronha"],
];

export default async function OnboardingPage({
  searchParams,
}: Props) {
  /*
   * O onboarding só pode ser acessado por um usuário
   * autenticado. Caso não exista sessão, o usuário será
   * direcionado automaticamente para /login.
   */
  const user = await requireAuthenticatedUser();

  /*
   * Procura uma organização vinculada ao usuário atual.
   */
  const organization = await getCurrentOrganization(user.id);

  /*
   * Caso exista organização, procura os locais cadastrados.
   */
  const sites = organization
    ? await getOrganizationSites(organization.id)
    : [];

  /*
   * Se o usuário já possuir organização e pelo menos um local,
   * o onboarding já foi concluído e ele deve ir ao painel.
   */
  if (organization && sites.length > 0) {
    redirect("/dashboard");
  }

  const params = await searchParams;

  const error =
    typeof params.error === "string"
      ? params.error
      : null;

  /*
   * Se já existir uma organização, cria apenas o primeiro local.
   * Caso contrário, cria a organização e o primeiro local.
   */
  const action = organization
    ? createFirstSite
    : createWorkspace;

  const currentUserEmail =
    user.email ?? "usuário autenticado";

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
            ? "Cadastre o primeiro local"
            : "Vamos preparar o MonitorIA para o seu negócio"}
        </h1>

        <p>
          {organization
            ? `A empresa ${organization.name} está criada. Agora cadastre o primeiro local e a primeira câmera.`
            : "Informe a empresa, o primeiro local e a primeira câmera uma única vez. O painel continuará a instalação com esses mesmos dados."}
        </p>

        {error ? (
          <div className="form-alert error">
            {error}
          </div>
        ) : null}

        {/*
         * Aviso da conta que está conectada agora.
         * O botão envia um POST para a rota de logout,
         * encerra a sessão atual e abre a tela de login.
         */}
        <div className="onboarding-note">
          <strong>Você está entrando por esta conta</strong>

          <span>
            Você está conectado como{" "}
            <strong>{currentUserEmail}</strong>.
          </span>

          <span>
            Se o seu cadastro estiver em outro e-mail,
            entre novamente com a conta certa.
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
              Já tenho cadastro — entrar com outra conta
            </button>
          </form>
        </div>

        <form
          action={action}
          className="onboarding-form"
        >
          {!organization ? (
            <label>
              <span>Nome da empresa</span>

              <input
                name="organization_name"
                type="text"
                placeholder="Ex.: Mercado São Jorge"
                minLength={2}
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
              required
            />
          </label>

          <label>
            <span>Nome da primeira câmera</span>

            <input
              name="camera_name"
              type="text"
              placeholder="Ex.: Entrada da loja"
              minLength={2}
              maxLength={160}
              required
            />
          </label>

          <label>
            <span>O que essa câmera deve acompanhar? (opcional)</span>

            <textarea
              name="monitoring_goals"
              rows={4}
              maxLength={2200}
              placeholder={[
                "Registrar entrada e saída de pessoas",
                "Identificar atendimentos no balcão",
              ].join("\n")}
            />
          </label>

          <label>
            <span>Fuso horário</span>

            <select
              name="timezone"
              defaultValue="America/Sao_Paulo"
            >
              {timezones.map(([value, label]) => (
                <option
                  value={value}
                  key={value}
                >
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="onboarding-note">
            <strong>O que acontece agora?</strong>

            <span>
              Você fica como responsável pela conta. Ao abrir o painel,
              mostraremos apenas os próximos passos para baixar o MonitorIA,
              gerar o código e conectar a câmera.
              Guardamos as imagens dos acontecimentos
              por 3 dias e o registro do que aconteceu
              por 1 ano.
            </span>
          </div>

          <button
            className="auth-submit"
            type="submit"
          >
            {organization
              ? "Salvar local e câmera"
              : "Salvar e continuar a instalação"}
          </button>
        </form>
      </section>
    </main>
  );
}
