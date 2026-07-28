import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization, getOrganizationSites } from "@/src/lib/dashboard-data";
import { createFirstSite, createWorkspace } from "./actions";

export const metadata = { title: "Configuração inicial" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const timezones = [
  ["America/Sao_Paulo", "Brasília / São Paulo"],
  ["America/Manaus", "Manaus"],
  ["America/Cuiaba", "Cuiabá"],
  ["America/Rio_Branco", "Rio Branco"],
  ["America/Noronha", "Fernando de Noronha"],
];

export default async function OnboardingPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  const sites = organization ? await getOrganizationSites(organization.id) : [];
  if (organization && sites.length > 0) redirect("/dashboard");

  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;
  const action = organization ? createFirstSite : createWorkspace;

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-progress">
          <span className="active">1</span><i /><span>2</span><i /><span>3</span>
        </div>
        <span className="auth-kicker">CONFIGURAÇÃO INICIAL</span>
        <h1>{organization ? "Cadastre o primeiro local" : "Prepare o MonitorIA para sua empresa"}</h1>
        <p>
          {organization
            ? `A organização ${organization.name} está criada. Agora informe onde a primeira câmera será instalada.`
            : "Crie a empresa e a primeira unidade. As câmeras e o agente local serão configurados na próxima etapa."}
        </p>

        {error ? <div className="form-alert error">{error}</div> : null}

        <form action={action} className="onboarding-form">
          {!organization ? (
            <label>
              <span>Nome da empresa</span>
              <input name="organization_name" type="text" placeholder="Ex.: Loja de Serviços" minLength={2} required />
            </label>
          ) : null}
          <label>
            <span>Nome do local</span>
            <input name="site_name" type="text" placeholder="Ex.: Unidade principal" required />
          </label>
          <label>
            <span>Fuso horário</span>
            <select name="timezone" defaultValue="America/Sao_Paulo">
              {timezones.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <div className="onboarding-note">
            <strong>O que acontece agora?</strong>
            <span>O usuário atual será proprietário da empresa. A política padrão guardará frames por 3 dias e metadados por 365 dias.</span>
          </div>
          <button className="auth-submit" type="submit">Criar ambiente e abrir painel</button>
        </form>
      </section>
    </main>
  );
}
