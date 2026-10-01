import { redirect } from "next/navigation";
import {
  requireAuthenticatedUser,
} from "@/src/lib/auth";
import {
  getCurrentOrganization,
} from "@/src/lib/dashboard-data";
import {
  readOnboardingIntake,
} from "@/src/lib/onboarding-intake";
import {
  createAdminClient,
} from "@/src/lib/supabase/admin";
import {
  DashboardSidebar,
} from "../../dashboard-sidebar";
import {
  DiscoveryPanel,
} from "./discovery-panel";
import type {
  DiscoveryAgentOption,
} from "./actions";

export const metadata = {
  title: "Procurar câmeras",
};
export const dynamic = "force-dynamic";

function relationOne(value: any) {
  return Array.isArray(value)
    ? value[0] ?? null
    : value ?? null;
}

export default async function CameraDiscoveryPage() {
  const user =
    await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  const intake = readOnboardingIntake(
    user.user_metadata,
  );
  const supabase =
    createAdminClient();

  const { data: agentRows } =
    await supabase
      .from("agents")
      .select(
        "id,name,status,site_id,last_heartbeat_at,site:sites(id,name)",
      )
      .eq(
        "organization_id",
        organization.id,
      )
      .eq("status", "online")
      .order("last_heartbeat_at", {
        ascending: false,
        nullsFirst: false,
      });

  const agents: DiscoveryAgentOption[] =
    (agentRows ?? []).map(
      (row: any) => ({
        id: String(row.id),
        name: String(
          row.name ??
            "MonitorIA Agent",
        ),
        status: String(
          row.status ?? "offline",
        ),
        siteId: String(row.site_id),
        siteName: String(
          relationOne(row.site)?.name ??
            "Local",
        ),
        lastHeartbeatAt:
          row.last_heartbeat_at
            ? String(
                row.last_heartbeat_at,
              )
            : null,
      }),
    );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={
          organization.name
        }
        userEmail={user.email}
        active="cameras"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERAS ·{" "}
              {organization.name.toUpperCase()}
            </span>
            <h1>Procurar câmeras</h1>
            <p>
              Escolha o local e o
              computador que está na
              mesma rede das câmeras.
              Cada busca é executada
              somente naquele Agent.
            </p>
          </div>
        </header>

        <DiscoveryPanel
          hasAgent={
            agents.length > 0
          }
          agents={agents}
          defaultCameraCount={
            intake.cameraCount
          }
        />
      </section>
    </main>
  );
}
