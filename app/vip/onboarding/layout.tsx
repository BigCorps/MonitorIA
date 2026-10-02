import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getVipProjectForOrganization } from "@/src/vip/server";

export default async function VipOnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const project = await getVipProjectForOrganization(organization.id);
  if (!project) redirect("/dashboard");

  if (
    project.status === "trial_completed" ||
    project.status === "proposal" ||
    project.status === "payment_pending"
  ) {
    redirect("/vip/closing");
  }

  if (project.status === "active") redirect("/vip/dashboard");
  if (project.status === "cancelled") redirect("/dashboard");

  return children;
}
