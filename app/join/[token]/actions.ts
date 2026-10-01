"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { sendTeamAccessCode } from "@/src/lib/team-notification";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function inviteRedirect(token: string, key: "message" | "error", message: string): never {
  redirect(`/join/${encodeURIComponent(token)}?${key}=${encodeURIComponent(message)}`);
}

async function validInvitation(token: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_invitations")
    .select("id,organization_id,email,role,expires_at,accepted_at,revoked_at,organization:organizations(name)")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.accepted_at || data.revoked_at) return null;
  if (Date.parse(String(data.expires_at)) <= Date.now()) return null;
  return data;
}

function organizationName(invitation: { organization?: unknown }) {
  const relation = Array.isArray(invitation.organization)
    ? invitation.organization[0]
    : invitation.organization;
  if (relation && typeof relation === "object" && !Array.isArray(relation)) {
    const name = (relation as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name;
  }
  return "Equipe MonitorIA";
}

async function ensureAuthOtp(email: string) {
  const admin = createAdminClient();
  const first = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (!first.error && first.data?.properties?.email_otp) return first;

  const normalized = String(first.error?.message ?? "").toLowerCase();
  const missingUser = normalized.includes("user not found") || normalized.includes("not found") || normalized.includes("does not exist");
  if (!missingUser) return first;

  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) return { data: null, error: created.error } as typeof first;
  return admin.auth.admin.generateLink({ type: "magiclink", email });
}

export async function sendTeamInviteAccessCodeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const invitation = await validInvitation(token);
  if (!invitation) inviteRedirect(token, "error", "Este convite não está mais disponível.");

  const email = String(invitation.email).trim().toLowerCase();
  const generated = await ensureAuthOtp(email);
  if (generated.error) {
    console.error("Falha ao gerar código de acesso da equipe:", generated.error.message);
    inviteRedirect(token, "error", "Não foi possível gerar o código de acesso agora. Tente novamente em instantes.");
  }

  const otp = String(generated.data?.properties?.email_otp ?? "").trim();
  if (!/^\d{6}$/.test(otp)) {
    console.error("OTP da equipe não foi retornado pelo Supabase.");
    inviteRedirect(token, "error", "Não foi possível preparar o código de acesso agora.");
  }

  const delivery = await sendTeamAccessCode({ email, code: otp, organizationName: organizationName(invitation) });
  if (!delivery.ok) inviteRedirect(token, "error", "Não foi possível enviar o código por e-mail agora. Tente novamente.");

  inviteRedirect(token, "message", `Enviamos um código de 6 dígitos para ${email}.`);
}

async function grantInvitation(input: {
  token: string;
  invitation: NonNullable<Awaited<ReturnType<typeof validInvitation>>>;
  user: { id: string; email?: string | null };
}) {
  const inviteEmail = String(input.invitation.email).trim().toLowerCase();
  const userEmail = String(input.user.email ?? "").trim().toLowerCase();
  if (!userEmail || userEmail !== inviteEmail) {
    inviteRedirect(input.token, "error", `Este convite foi enviado para ${inviteEmail}. Entre com esse e-mail para aceitar.`);
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", input.invitation.organization_id)
    .eq("user_id", input.user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: input.invitation.organization_id,
      user_id: input.user.id,
      role: input.invitation.role,
    });
    if (memberError) {
      console.error("Falha ao aceitar convite da equipe:", memberError.message);
      inviteRedirect(input.token, "error", "Não foi possível adicionar seu acesso à equipe.");
    }
  }

  const { error: acceptError } = await admin
    .from("organization_invitations")
    .update({ accepted_by: input.user.id, accepted_at: new Date().toISOString() })
    .eq("id", input.invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (acceptError) {
    console.error("Falha ao marcar convite como aceito:", acceptError.message);
    inviteRedirect(input.token, "error", "Seu acesso foi criado, mas não conseguimos concluir o convite. Tente novamente.");
  }

  await admin.from("audit_logs").insert({
    organization_id: input.invitation.organization_id,
    actor_user_id: input.user.id,
    action: "team_invite_accepted",
    entity_type: "organization_team",
    entity_id: input.user.id,
    metadata: { role: input.invitation.role, email: inviteEmail, auth_method: "email_otp" },
  });

  redirect("/dashboard?message=" + encodeURIComponent("Convite aceito. Você já está na equipe."));
}

export async function verifyTeamInviteAccessCodeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 6);
  if (!token) return;
  if (!/^\d{6}$/.test(code)) inviteRedirect(token, "error", "Digite o código de 6 dígitos recebido por e-mail.");

  const invitation = await validInvitation(token);
  if (!invitation) inviteRedirect(token, "error", "Este convite não está mais disponível.");

  const email = String(invitation.email).trim().toLowerCase();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error || !data.user) {
    console.error("Falha ao validar código da equipe:", error?.message ?? "missing_user");
    inviteRedirect(token, "error", "Código inválido ou expirado. Solicite um novo código e tente novamente.");
  }

  await grantInvitation({ token, invitation, user: { id: data.user.id, email: data.user.email } });
}

export async function acceptTeamInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;
  const user = await requireAuthenticatedUser();
  const invitation = await validInvitation(token);
  if (!invitation) inviteRedirect(token, "error", "Este convite expirou, foi cancelado ou já foi usado.");
  await grantInvitation({ token, invitation, user });
}

export const sendTeamInviteAccessLinkAction = sendTeamInviteAccessCodeAction;
