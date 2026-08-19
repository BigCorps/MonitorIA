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

export const metadata = {
  title: "Procurar câmeras",
};
export const dynamic = "force-dynamic";

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
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("agents")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq(
      "organization_id",
      organization.id,
    )
    .neq("status", "disabled");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
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
              O computador da loja procura as
              câmeras sozinho. Você responde duas
              perguntas e acompanha aqui.
            </p>
          </div>
        </header>

        <DiscoveryPanel
          hasAgent={(count ?? 0) > 0}
          defaultCameraCount={
            intake.cameraCount
          }
        />
      </section>
    </main>
  );
}
