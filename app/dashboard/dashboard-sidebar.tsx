import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { isInternalOperatorEmail } from "@/src/lib/internal-operator";
import {
  DashboardSidebarClient,
  type DashboardSection,
} from "./dashboard-sidebar-client";

export type { DashboardSection } from "./dashboard-sidebar-client";

type Props = {
  organizationName: string;
  userEmail: string | null;
  active: DashboardSection;
};

export async function DashboardSidebar(props: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  return (
    <DashboardSidebarClient
      {...props}
      organizationRole={organization?.role ?? "viewer"}
      isInternalOperator={isInternalOperatorEmail(user.email)}
    />
  );
}
