import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { isInternalOperatorEmail } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
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

const POST_CAPTURE_TRIAL_STATUSES = new Set([
  "capture_completed",
  "exploration",
  "expired",
  "purged",
]);

async function redirectOverviewAfterTrial(input: {
  organizationId: string;
  active: DashboardSection;
}) {
  if (input.active !== "overview") return;

  const admin = createAdminClient();

  const [trialResult, entitlementResult] = await Promise.all([
    admin
      .from("trial_runs")
      .select("status,capture_ends_at")
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("camera_entitlements")
      .select("camera_id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("monitoring_allowed", true),
  ]);

  // Em caso de indisponibilidade temporária, não bloqueia o dashboard.
  // O backend comercial continua sendo a autoridade do monitoramento.
  if (trialResult.error || entitlementResult.error) return;

  const trial = trialResult.data as {
    status?: string | null;
    capture_ends_at?: string | null;
  } | null;

  if (!trial) return;

  const status = String(trial.status ?? "");
  const captureEnd = trial.capture_ends_at
    ? Date.parse(String(trial.capture_ends_at))
    : Number.POSITIVE_INFINITY;

  const captureEndedByClock =
    status === "running" &&
    Number.isFinite(captureEnd) &&
    captureEnd <= Date.now();

  const postCapture =
    POST_CAPTURE_TRIAL_STATUSES.has(status) ||
    captureEndedByClock;

  if (postCapture && (entitlementResult.count ?? 0) === 0) {
    redirect("/dashboard/trial");
  }
}

export async function DashboardSidebar(props: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (organization) {
    await redirectOverviewAfterTrial({
      organizationId: organization.id,
      active: props.active,
    });
  }

  return (
    <DashboardSidebarClient
      {...props}
      organizationRole={organization?.role ?? "viewer"}
      isInternalOperator={isInternalOperatorEmail(user.email)}
    />
  );
}
