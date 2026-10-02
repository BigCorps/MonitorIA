import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { getRunningTrialCameraState } from "@/src/lib/trial-camera-state";
import { getOrganizationCameraProductHealth } from "@/src/lib/camera-product-state-data";
import { StandardCameraHealth } from "@/src/components/standard-camera-health";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import styles from "./cameras.module.css";

export const metadata = { title: "Câmeras" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function CamerasPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [sites, trialState, health, query] = await Promise.all([
    getOrganizationSites(organization.id),
    getRunningTrialCameraState(organization.id),
    getOrganizationCameraProductHealth(organization.id, {
      experience: "standard",
    }),
    searchParams,
  ]);

  if (!sites.length) redirect("/onboarding");

  const requestedSite = first(query.site);
  const selectedSiteId =
    requestedSite &&
    (requestedSite === "all" ||
      health.sites.some((site) => site.id === requestedSite))
      ? requestedSite
      : "all";

  const selectedCameraId = first(query.camera);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERAS · {organization.name.toUpperCase()}
            </span>
            <h1>Câmeras do MonitorIA</h1>
            <p>
              Veja quais câmeras estão realmente monitorando, quais ainda
              precisam de configuração e qual é o próximo passo para cada uma.
            </p>
          </div>

          <Link
            href="/dashboard/cameras/discovery"
            className="panel-primary-action"
          >
            Procurar câmeras
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        {trialState.running ? (
          <div className={styles.trialNotice}>
            <strong>Período de teste em andamento</strong>
            <span>
              {trialState.cameraIds.length === 1
                ? "Uma câmera está ativa no teste. As demais podem continuar conectadas e ficam visíveis com o estado real abaixo."
                : `${trialState.cameraIds.length} câmeras estão ativas no teste. As demais continuam visíveis com o estado real abaixo.`}
            </span>
          </div>
        ) : null}

        <StandardCameraHealth
          data={health}
          selectedSiteId={selectedSiteId}
          selectedCameraId={selectedCameraId}
        />


      </section>
    </main>
  );
}
