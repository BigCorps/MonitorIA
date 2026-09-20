import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { getRecordingSourceSummaries } from "@/src/lib/recording-source";
import { DashboardSidebar } from "../dashboard-sidebar";
import { RecordingsClient } from "./recordings-client";
import styles from "./recordings.module.css";

export const metadata = {
  title: "Gravações",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function RecordingsPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [sites, sources, params] = await Promise.all([
    getOrganizationSites(organization.id),
    getRecordingSourceSummaries(organization.id),
    searchParams,
  ]);

  if (!sites.length) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="recordings"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              GRAVAÇÕES · {organization.name.toUpperCase()}
            </span>
            <h1>Analise vídeos sem instalar o Agent</h1>
            <p>
              O arquivo original permanece neste dispositivo. O MonitorIA
              processa localmente e envia somente as imagens dos acontecimentos
              que precisam de análise.
            </p>
          </div>
        </header>

        <RecordingsClient
          sites={sites}
          initialSources={sources}
          initialSourceId={first(params.source)}
          canManage={["owner", "admin"].includes(organization.role)}
        />
      </section>
    </main>
  );
}
