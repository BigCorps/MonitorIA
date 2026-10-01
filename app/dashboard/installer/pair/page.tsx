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

export const metadata = {
  title: "Trocar ou reparar computador",
};
export const dynamic = "force-dynamic";

export default async function PairComputerPage() {
  const user =
    await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  if (
    !["owner", "admin"].includes(
      organization.role,
    )
  ) {
    redirect("/dashboard/installer");
  }

  const sites =
    await getOrganizationSites(
      organization.id,
    );

  const supabase =
    createAdminClient();

  const { data: cameras } =
    await supabase
      .from("cameras")
      .select("id,site_id")
      .eq(
        "organization_id",
        organization.id,
      );

  const counts =
    new Map<string, number>();

  for (const row of cameras ?? []) {
    const siteId = String(
      (row as { site_id: string })
        .site_id,
    );
    counts.set(
      siteId,
      (counts.get(siteId) ?? 0) + 1,
    );
  }

  const options = sites.map(
    (site) => ({
      ...site,
      cameraCount:
        counts.get(site.id) ?? 0,
    }),
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={
          organization.name
        }
        userEmail={user.email}
        active="installer"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INSTALAÇÃO ·{" "}
              {organization.name.toUpperCase()}
            </span>
            <h1>
              Trocar ou reparar o computador
            </h1>
            <p>
              Use este assistente para trocar o
              computador de um local existente ou
              para conectar um Agent em outro
              endereço da mesma empresa.
            </p>
          </div>

          <Link
            href="/dashboard/installer"
            className="panel-secondary-action"
          >
            Voltar para Instalação
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <div
          className={
            styles.maintenanceNotice
          }
        >
          <strong>
            Um Agent ativo por local
          </strong>
          <p>
            A mesma empresa pode ter vários locais.
            Cada local possui seu próprio Agent e
            suas próprias câmeras. Parear um novo
            computador em um local existente
            substitui somente o Agent daquele local.
          </p>
        </div>

        <RepairConnectionFlow
          sites={options}
        />
      </section>
    </main>
  );
}
