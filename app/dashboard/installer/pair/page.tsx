import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { RepairConnectionFlow } from "./repair-connection-flow";
import styles from "./pair.module.css";

export const metadata = { title: "Trocar ou reparar computador" };
export const dynamic = "force-dynamic";

export default async function PairComputerPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  if (!["owner", "admin"].includes(organization.role)) {
    redirect("/dashboard/installer");
  }

  const sites = await getOrganizationSites(organization.id);
  const site = sites[0];

  if (!site) {
    redirect("/onboarding");
  }

  const supabase = createAdminClient();
  const { count } = await supabase
    .from("cameras")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id)
    .eq("site_id", site.id);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="installer"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INSTALAÇÃO · {organization.name.toUpperCase()}
            </span>
            <h1>Trocar ou reparar o computador</h1>
            <p>
              Use somente quando uma instalação nova pedir código, quando trocar
              de PC ou quando alternar entre MonitorIA 24/7 e Microsoft Store.
              O primeiro acesso normal continua sendo feito pelo onboarding.
            </p>
          </div>

          <Link href="/dashboard/installer" className="panel-secondary-action">
            Voltar para Instalação
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <div className={styles.maintenanceNotice}>
          <strong>Fluxo de manutenção</strong>
          <p>
            Este assistente não cria um segundo cadastro do local. Ele troca o
            computador responsável e reassocia as câmeras existentes.
          </p>
        </div>

        <RepairConnectionFlow existingCameraCount={count ?? 0} />
      </section>
    </main>
  );
}
