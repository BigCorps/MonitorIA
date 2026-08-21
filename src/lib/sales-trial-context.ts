import type { AuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type TrialOriginContext = {
  id: string;
  trialMode: "self_service" | "sales_assisted";
  status: string;
  durationMinutes: number;
  maxCameras: number;
  salesInviteId: string | null;
};

function isSalesLeadUser(user: AuthenticatedUser) {
  const metadata = user.user_metadata ?? {};
  return (
    metadata.sales_trial_invite === true ||
    metadata.onboarding_source === "sales_lead_v1"
  );
}

async function loadTrial(
  organizationId: string,
): Promise<TrialOriginContext | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("trial_runs")
    .select("id,trial_mode,status,duration_minutes,max_cameras,sales_invite_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Falha ao identificar a origem do trial:", error.message);
    return null;
  }

  if (!data) return null;

  return {
    id: String(data.id),
    trialMode:
      String(data.trial_mode) === "sales_assisted"
        ? "sales_assisted"
        : "self_service",
    status: String(data.status),
    durationMinutes: Number(data.duration_minutes ?? 1440),
    maxCameras: Number(data.max_cameras ?? 1),
    salesInviteId: data.sales_invite_id ? String(data.sales_invite_id) : null,
  };
}

/**
 * Recuperação segura do contexto comercial.
 *
 * O token do convite nunca é persistido em texto puro. Se um usuário criado
 * pelo fluxo /lead confirmar o e-mail e entrar diretamente no dashboard antes
 * de voltar ao link, usamos somente o e-mail autenticado + o token_hash já
 * armazenado para resgatar o convite ainda ativo.
 */
export async function ensureSalesTrialForOrganization(
  user: AuthenticatedUser,
  organizationId: string,
): Promise<TrialOriginContext | null> {
  const existing = await loadTrial(organizationId);

  if (existing?.trialMode === "sales_assisted") {
    return existing;
  }

  // Nunca substitui um teste que já começou.
  if (
    existing &&
    !["draft", "ready"].includes(existing.status)
  ) {
    return existing;
  }

  if (!isSalesLeadUser(user) || !user.email) {
    return existing;
  }

  const admin = createAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from("sales_trial_invites")
    .select("id,token_hash,duration_minutes,max_cameras")
    .eq("lead_email", user.email.trim().toLowerCase())
    .is("redeemed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteError) {
    console.error(
      "Falha ao recuperar convite comercial pendente:",
      inviteError.message,
    );
    return existing;
  }

  if (!invite) return existing;

  const { data, error } = await admin.rpc("redeem_sales_trial_invite", {
    p_token_hash: String(invite.token_hash),
    p_organization_id: organizationId,
    p_user_id: user.id,
  });

  if (error) {
    console.error(
      "Falha ao recuperar automaticamente o trial comercial:",
      error.message,
    );
    return existing;
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  if (result.success !== true) {
    console.error("Convite comercial pendente não pôde ser aplicado automaticamente.");
    return existing;
  }

  return loadTrial(organizationId);
}
