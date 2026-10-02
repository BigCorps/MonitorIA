"use server";

import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { sendTeamAccessCode } from "@/src/lib/team-notification";

const ACCESS_CODE_MINUTES = 10;
const ACCESS_CODE_MAX_ATTEMPTS = 5;
const ACCESS_CODE_RESEND_COOLDOWN_SECONDS = 60;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function inviteRedirect(
  token: string,
  key: "message" | "error",
  message: string,
): never {
  redirect(
    `/join/${encodeURIComponent(token)}?${key}=${encodeURIComponent(message)}`,
  );
}

function codeSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  }
  return secret;
}

function accessCodeHash(invitationId: string, code: string) {
  return createHmac("sha256", codeSecret())
    .update(`${invitationId}:${code}`)
    .digest("hex");
}

function sameHash(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(left, "hex"),
    Buffer.from(right, "hex"),
  );
}

async function validInvitation(token: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_invitations")
    .select(
      "id,organization_id,email,role,expires_at,accepted_at,revoked_at,access_code_hash,access_code_expires_at,access_code_attempts,access_code_sent_at,organization:organizations(name)",
    )
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

  if (
    relation &&
    typeof relation === "object" &&
    !Array.isArray(relation)
  ) {
    const name = (relation as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name;
    }
  }

  return "Equipe MonitorIA";
}

async function auditInvite(input: {
  invitationId: string;
  organizationId: string;
  action: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: null,
    action: input.action,
    entity_type: "organization_team",
    entity_id: input.invitationId,
    metadata: input.metadata ?? {},
  });
}

/**
 * Convites corporativos usam um código próprio do MonitorIA.
 *
 * O link do convite não autentica ninguém. Scanners corporativos podem abri-lo
 * sem consumir o acesso; a confirmação depende de um código de 6 dígitos que
 * existe somente como HMAC no banco.
 */
export async function sendTeamInviteAccessCodeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const invitation = await validInvitation(token);
  if (!invitation) {
    inviteRedirect(token, "error", "Este convite não está mais disponível.");
  }

  const lastSentAt = invitation.access_code_sent_at
    ? Date.parse(String(invitation.access_code_sent_at))
    : Number.NaN;
  const elapsed = Number.isFinite(lastSentAt)
    ? Date.now() - lastSentAt
    : Number.POSITIVE_INFINITY;
  const cooldownMs = ACCESS_CODE_RESEND_COOLDOWN_SECONDS * 1000;

  if (elapsed < cooldownMs) {
    const remaining = Math.max(1, Math.ceil((cooldownMs - elapsed) / 1000));
    inviteRedirect(
      token,
      "error",
      `Um código já foi enviado. Aguarde ${remaining} segundo(s) antes de pedir outro.`,
    );
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = accessCodeHash(String(invitation.id), code);
  const expiresAt = new Date(
    Date.now() + ACCESS_CODE_MINUTES * 60_000,
  ).toISOString();

  const admin = createAdminClient();
  const sentAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("organization_invitations")
    .update({
      access_code_hash: codeHash,
      access_code_expires_at: expiresAt,
      access_code_attempts: 0,
      access_code_sent_at: sentAt,
    })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    console.error(
      "Falha ao preparar código da equipe:",
      updateError?.message ?? "invitation_not_updated",
    );
    inviteRedirect(
      token,
      "error",
      "Não foi possível preparar o código de acesso agora. Tente novamente em instantes.",
    );
  }

  const email = String(invitation.email).trim().toLowerCase();
  const delivery = await sendTeamAccessCode({
    email,
    code,
    organizationName: organizationName(invitation),
  });

  if (!delivery.ok) {
    await admin
      .from("organization_invitations")
      .update({
        access_code_hash: null,
        access_code_expires_at: null,
        access_code_attempts: 0,
        access_code_sent_at: null,
      })
      .eq("id", invitation.id)
      .eq("access_code_hash", codeHash);

    console.error("Falha ao enviar código da equipe:", delivery.error);
    inviteRedirect(
      token,
      "error",
      delivery.error === "resend_from_not_configured"
        ? "O e-mail de acesso ainda não está configurado corretamente. A administração do MonitorIA foi avisada."
        : "Não foi possível enviar o código por e-mail agora. Tente novamente.",
    );
  }

  await auditInvite({
    invitationId: String(invitation.id),
    organizationId: String(invitation.organization_id),
    action: "team_invite_code_sent",
    metadata: {
      email,
      expires_at: expiresAt,
      resend_cooldown_seconds: ACCESS_CODE_RESEND_COOLDOWN_SECONDS,
    },
  });

  inviteRedirect(
    token,
    "message",
    `Enviamos um código de 6 dígitos para ${email}. Ele vale por ${ACCESS_CODE_MINUTES} minutos.`,
  );
}

async function grantInvitation(input: {
  token: string;
  invitation: NonNullable<Awaited<ReturnType<typeof validInvitation>>>;
  user: { id: string; email?: string | null };
}) {
  const inviteEmail = String(input.invitation.email).trim().toLowerCase();
  const userEmail = String(input.user.email ?? "").trim().toLowerCase();

  if (!userEmail || userEmail !== inviteEmail) {
    inviteRedirect(
      input.token,
      "error",
      `Este convite foi enviado para ${inviteEmail}. Entre com esse e-mail para aceitar.`,
    );
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", input.invitation.organization_id)
    .eq("user_id", input.user.id)
    .maybeSingle();

  if (!existing) {
    const { error: memberError } = await admin
      .from("organization_members")
      .insert({
        organization_id: input.invitation.organization_id,
        user_id: input.user.id,
        role: input.invitation.role,
      });

    if (memberError) {
      console.error(
        "Falha ao aceitar convite da equipe:",
        memberError.message,
      );
      inviteRedirect(
        input.token,
        "error",
        "Não foi possível adicionar seu acesso à equipe.",
      );
    }
  }

  const { error: acceptError } = await admin
    .from("organization_invitations")
    .update({
      accepted_by: input.user.id,
      accepted_at: new Date().toISOString(),
      access_code_hash: null,
      access_code_expires_at: null,
      access_code_attempts: 0,
      access_code_sent_at: null,
    })
    .eq("id", input.invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (acceptError) {
    console.error(
      "Falha ao marcar convite como aceito:",
      acceptError.message,
    );
    inviteRedirect(
      input.token,
      "error",
      "Seu acesso foi criado, mas não conseguimos concluir o convite. Tente novamente.",
    );
  }

  await admin.from("audit_logs").insert({
    organization_id: input.invitation.organization_id,
    actor_user_id: input.user.id,
    action: "team_invite_accepted",
    entity_type: "organization_team",
    entity_id: input.user.id,
    metadata: {
      role: input.invitation.role,
      email: inviteEmail,
      auth_method: "monitoria_email_code",
    },
  });

  redirect(
    "/dashboard?message=" +
      encodeURIComponent("Convite aceito. Você já está na equipe."),
  );
}

export async function verifyTeamInviteAccessCodeAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .replace(/\D/g, "")
    .slice(0, 6);

  if (!token) return;

  if (!/^\d{6}$/.test(code)) {
    inviteRedirect(
      token,
      "error",
      "Digite o código de 6 dígitos recebido por e-mail.",
    );
  }

  const invitation = await validInvitation(token);
  if (!invitation) {
    inviteRedirect(token, "error", "Este convite não está mais disponível.");
  }

  const storedHash = String(invitation.access_code_hash ?? "");
  const codeExpiresAt = Date.parse(
    String(invitation.access_code_expires_at ?? ""),
  );
  const attempts = Number(invitation.access_code_attempts ?? 0);

  if (
    !storedHash ||
    !Number.isFinite(codeExpiresAt) ||
    codeExpiresAt <= Date.now()
  ) {
    inviteRedirect(
      token,
      "error",
      "O código expirou ou ainda não foi solicitado. Peça um novo código.",
    );
  }

  if (attempts >= ACCESS_CODE_MAX_ATTEMPTS) {
    inviteRedirect(
      token,
      "error",
      "Este código foi bloqueado por excesso de tentativas. Solicite um novo código.",
    );
  }

  const candidateHash = accessCodeHash(String(invitation.id), code);
  if (!sameHash(storedHash, candidateHash)) {
    const admin = createAdminClient();
    await admin
      .from("organization_invitations")
      .update({
        access_code_attempts: Math.min(
          ACCESS_CODE_MAX_ATTEMPTS,
          attempts + 1,
        ),
      })
      .eq("id", invitation.id)
      .eq("access_code_hash", storedHash);

    inviteRedirect(
      token,
      "error",
      attempts + 1 >= ACCESS_CODE_MAX_ATTEMPTS
        ? "Código incorreto. Por segurança, solicite um novo código."
        : "Código incorreto. Confira o e-mail e tente novamente.",
    );
  }

  const email = String(invitation.email).trim().toLowerCase();
  const admin = createAdminClient();

  // Só depois de o código próprio ser validado criamos um token Supabase.
  // Ele nunca é enviado por e-mail, então scanners corporativos não podem
  // consumi-lo antes do usuário.
  const generated = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (generated.error || !generated.data?.properties?.hashed_token) {
    console.error(
      "Falha ao preparar sessão da equipe:",
      generated.error?.message ?? "hashed_token_not_returned",
    );
    inviteRedirect(
      token,
      "error",
      "O código foi validado, mas não foi possível abrir sua sessão agora. Tente novamente.",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: generated.data.properties.hashed_token,
    type: "magiclink",
  });

  if (error || !data.user) {
    console.error(
      "Falha ao abrir sessão da equipe:",
      error?.message ?? "missing_user",
    );
    inviteRedirect(
      token,
      "error",
      "O código foi validado, mas não foi possível abrir sua sessão agora. Solicite um novo código.",
    );
  }

  await auditInvite({
    invitationId: String(invitation.id),
    organizationId: String(invitation.organization_id),
    action: "team_invite_code_verified",
    metadata: { email, attempts },
  });

  await grantInvitation({
    token,
    invitation,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
}

export async function acceptTeamInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return;

  const user = await requireAuthenticatedUser();
  const invitation = await validInvitation(token);

  if (!invitation) {
    inviteRedirect(
      token,
      "error",
      "Este convite expirou, foi cancelado ou já foi usado.",
    );
  }

  await grantInvitation({
    token,
    invitation,
    user,
  });
}

export const sendTeamInviteAccessLinkAction =
  sendTeamInviteAccessCodeAction;
