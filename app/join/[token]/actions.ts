"use server";

import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { appConfig } from "@/src/lib/app-config";
import { getAuthenticatedUser, requireAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";

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
    .select("id,organization_id,email,role,expires_at,accepted_at,revoked_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.accepted_at || data.revoked_at) return null;
  if (Date.parse(String(data.expires_at)) <= Date.now()) return null;

  return data;
}

export async function sendTeamInviteAccessLinkAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const invitation = await validInvitation(token);
  if (!invitation) {
    inviteRedirect(token, "error", "Este convite não está mais disponível.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: String(invitation.email),
    options: {
      shouldCreateUser: true,
      emailRedirectTo:
        `${appConfig.url}/auth/callback?next=` +
        encodeURIComponent(`/join/${token}`),
    },
  });

  if (error) {
    console.error("Falha ao enviar acesso do convite:", error.message);
    inviteRedirect(token, "error", "Não foi possível enviar o link de acesso agora.");
  }

  inviteRedirect(token, "message", `Enviamos um link de acesso para ${invitation.email}.`);
}

export async function acceptTeamInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const user = await requireAuthenticatedUser();
  const invitation = await validInvitation(token);
  if (!invitation) {
    inviteRedirect(token, "error", "Este convite expirou, foi cancelado ou já foi usado.");
  }

  const userEmail = user.email?.trim().toLowerCase();
  const inviteEmail = String(invitation.email).trim().toLowerCase();

  if (!userEmail || userEmail !== inviteEmail) {
    inviteRedirect(
      token,
      "error",
      `Este convite foi enviado para ${inviteEmail}. Entre com esse e-mail para aceitar.`,
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", invitation.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await admin.from("organization_members").insert({
      organization_id: invitation.organization_id,
      user_id: user.id,
      role: invitation.role,
    });

    if (memberError) {
      console.error("Falha ao aceitar convite da equipe:", memberError.message);
      inviteRedirect(token, "error", "Não foi possível adicionar seu acesso à equipe.");
    }
  }

  await admin
    .from("organization_invitations")
    .update({
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null);

  await admin.from("audit_logs").insert({
    organization_id: invitation.organization_id,
    actor_user_id: user.id,
    action: "team_invite_accepted",
    entity_type: "organization_team",
    entity_id: user.id,
    metadata: { role: invitation.role, email: inviteEmail },
  });

  redirect("/dashboard?message=" + encodeURIComponent("Convite aceito. Você já está na equipe."));
}
