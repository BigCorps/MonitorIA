import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  hashSalesTrialToken,
  normalizeSalesTrialToken,
} from "@/src/trial/sales-token";

export type SalesTrialInviteStatus =
  | "active"
  | "expired"
  | "revoked"
  | "redeemed"
  | "invalid";

export type SalesTrialInvite = {
  id: string;
  status: SalesTrialInviteStatus;
  usable: boolean;
  leadName: string | null;
  leadEmail: string | null;
  companyName: string | null;
  selectedPlanCode: string;
  durationMinutes: number;
  maxCameras: number;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  redeemedOrganizationId: string | null;
  trialRunId: string | null;
};

export async function getSalesTrialInvite(
  rawToken: unknown,
): Promise<SalesTrialInvite | null> {
  const token = normalizeSalesTrialToken(rawToken);
  if (!token) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sales_trial_invites")
    .select(
      "id,lead_name,lead_email,company_name,selected_plan_code,duration_minutes,max_cameras,expires_at,revoked_at,redeemed_at,redeemed_by,redeemed_organization_id,trial_run_id",
    )
    .eq("token_hash", hashSalesTrialToken(token))
    .maybeSingle();

  if (error) {
    console.error("Falha ao consultar convite comercial:", error.message);
    throw new Error("sales_trial_invite_unavailable");
  }

  if (!data) return null;

  const now = Date.now();
  const expired = new Date(String(data.expires_at)).getTime() <= now;
  const revoked = Boolean(data.revoked_at);
  const redeemed = Boolean(data.redeemed_at);

  const status: SalesTrialInviteStatus = revoked
    ? "revoked"
    : redeemed
      ? "redeemed"
      : expired
        ? "expired"
        : "active";

  return {
    id: String(data.id),
    status,
    usable: status === "active",
    leadName: data.lead_name ? String(data.lead_name) : null,
    leadEmail: data.lead_email ? String(data.lead_email) : null,
    companyName: data.company_name ? String(data.company_name) : null,
    selectedPlanCode: String(data.selected_plan_code),
    durationMinutes: Number(data.duration_minutes),
    maxCameras: Number(data.max_cameras),
    expiresAt: String(data.expires_at),
    redeemedAt: data.redeemed_at ? String(data.redeemed_at) : null,
    redeemedBy: data.redeemed_by ? String(data.redeemed_by) : null,
    redeemedOrganizationId: data.redeemed_organization_id
      ? String(data.redeemed_organization_id)
      : null,
    trialRunId: data.trial_run_id ? String(data.trial_run_id) : null,
  };
}
