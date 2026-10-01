import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getOrganizationTeam, type TeamRole } from "@/src/lib/team-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { TeamManager } from "./team-manager";
import styles from "./team.module.css";

export const metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  let team = {
    members: [],
    invitations: [],
    invitationsTableReady: false,
  } as Awaited<ReturnType<typeof getOrganizationTeam>>;

  try {
    team = await getOrganizationTeam(organization.id);
  } catch (error) {
    console.error("Falha ao carregar equipe:", error);
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="profile"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">EQUIPE · {organization.name.toUpperCase()}</span>
            <h1>Pessoas e acessos</h1>
            <p>
              Convide sua equipe para a mesma empresa. Para técnicos que precisam instalar Agents,
              configurar locais e câmeras, use Administrador. Operador e Visualizador são níveis mais restritos.
            </p>
          </div>
        </header>

        <DashboardSectionTabs group="settings" />

        <TeamManager
          members={team.members}
          invitations={team.invitations}
          currentUserId={user.id}
          currentRole={organization.role as TeamRole}
          invitationsTableReady={team.invitationsTableReady}
        />
      </section>
    </main>
  );
}
