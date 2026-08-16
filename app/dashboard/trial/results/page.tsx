import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getSalesTrialResultsForOrganization } from "@/src/lib/trial-results";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { TrialResultsView } from "./trial-results-view";

export const metadata = { title: "Resultado da demonstração" };
export const dynamic = "force-dynamic";

export default async function TrialResultsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const result = await getSalesTrialResultsForOrganization(organization.id);
  if (!result) redirect("/dashboard/trial");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="trial"
      />
      <section className="dashboard-content">
        <DashboardSectionTabs group="settings" />
        <TrialResultsView result={result} viewer="customer" />
      </section>
    </main>
  );
}
