"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { appConfig } from "@/src/lib/app-config";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { sendTeamInvitation } from "@/src/lib/team-notification";

type TeamRole = "admin" | "operator" | "viewer";

export type TeamActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  inviteUrl?: string;
  emailSent?: boolean;
};

const initialRoleLabels: Record<TeamRole, string> = {
  admin: "Administrador",
  operator: "Operador",
  viewer: "Visualizador",
};

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value ?? "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function managerContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization || !["owner", "admin"].includes(organization.role)) {
    return null;
  }

  return { user, organization };
}

async function audit(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: "organization_team",
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function inviteTeamMemberAction(
  _previous: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const context = await managerContext();
  if (!context) {
    return { status: "error", message: "Você não tem permissão para convidar pessoas." };
  }

  const email = normalizeEmail(formData.get("email"));
  const role = String(formData.get("role") ?? "viewer") as TeamRole;

  if (!validEmail(email)) {
    return { status: "error", message: "Informe um e-mail válido." };
  }

  if (!Object.hasOwn(initialRoleLabels, role)) {
    return { status: "error", message: "Selecione um nível de acesso válido." };
  }

  if (context.organization.role === "admin" && role === "admin") {
    return {
      status: "error",
      message: "Somente o proprietário pode convidar outro administrador.",
    };
  }

  if (email === context.user.email?.toLowerCase()) {
    return { status: "error", message: "Este e-mail já é o seu acesso atual." };
  }

  const admin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Se a pessoa já é membro, não cria outro convite.
  const { data: memberships } = await admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", context.organization.id);

  for (const membership of memberships ?? []) {
    const { data } = await admin.auth.admin.getUserById(String(membership.user_id));
    if (data.user?.email?.toLowerCase() === email) {
      return { status: "error", message: "Este e-mail já faz parte da equipe." };
    }
  }

  await admin
    .from("organization_invitations")
    .update({ revoked_at: now.toISOString() })
    .eq("organization_id", context.organization.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const { data: invite, error } = await admin
    .from("organization_invitations")
    .insert({
      organization_id: context.organization.id,
      email,
      role,
      token_hash: tokenHash(token),
      invited_by: context.user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !invite) {
    console.error("Falha ao criar convite da equipe:", error?.message);
    return {
      status: "error",
      message:
        error?.code === "42P01" || error?.code === "PGRST205"
          ? "A migration de equipe ainda não foi aplicada no Supabase."
          : "Não foi possível criar o convite agora.",
    };
  }

  const inviteUrl = `${appConfig.url}/join/${token}`;
  const inviterName =
    String(context.user.user_metadata?.full_name ?? "").trim() ||
    context.user.email ||
    "Um administrador";

  const delivery = await sendTeamInvitation({
    email,
    organizationName: context.organization.name,
    inviterName,
    roleLabel: initialRoleLabels[role],
    inviteUrl,
    expiresAt,
  });

  await audit({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "team_invite_created",
    entityId: String(invite.id),
    metadata: { email, role, emailSent: delivery.ok },
  });

  revalidatePath("/dashboard/team");

  return {
    status: "success",
    message: delivery.ok
      ? `Convite enviado para ${email}.`
      : "Convite criado. O e-mail automático não saiu, então copie o link abaixo e envie à pessoa.",
    inviteUrl,
    emailSent: delivery.ok,
  };
}

export async function revokeTeamInvitationAction(formData: FormData) {
  const context = await managerContext();
  if (!context) return;

  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) return;

  const admin = createAdminClient();
  const { data: invite } = await admin
    .from("organization_invitations")
    .select("id,email,role")
    .eq("id", invitationId)
    .eq("organization_id", context.organization.id)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (!invite) return;
  if (context.organization.role === "admin" && invite.role === "admin") return;

  await admin
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("organization_id", context.organization.id);

  await audit({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "team_invite_revoked",
    entityId: invitationId,
    metadata: { email: invite.email, role: invite.role },
  });

  revalidatePath("/dashboard/team");
}

export async function updateTeamMemberRoleAction(formData: FormData) {
  const context = await managerContext();
  if (!context) return;

  const userId = String(formData.get("user_id") ?? "").trim();
  const role = String(formData.get("role") ?? "viewer") as TeamRole;
  if (!userId || !Object.hasOwn(initialRoleLabels, role)) return;

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.organization.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member || member.role === "owner") return;

  if (
    context.organization.role === "admin" &&
    (member.role === "admin" || role === "admin")
  ) {
    return;
  }

  await admin
    .from("organization_members")
    .update({ role })
    .eq("organization_id", context.organization.id)
    .eq("user_id", userId);

  await audit({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "team_member_role_updated",
    entityId: userId,
    metadata: { from: member.role, to: role },
  });

  revalidatePath("/dashboard/team");
}

export async function removeTeamMemberAction(formData: FormData) {
  const context = await managerContext();
  if (!context) return;

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId || userId === context.user.id) return;

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("organization_members")
    .select("role")
    .eq("organization_id", context.organization.id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!member || member.role === "owner") return;
  if (context.organization.role === "admin" && member.role === "admin") return;

  await admin
    .from("organization_members")
    .delete()
    .eq("organization_id", context.organization.id)
    .eq("user_id", userId);

  await audit({
    organizationId: context.organization.id,
    actorUserId: context.user.id,
    action: "team_member_removed",
    entityId: userId,
    metadata: { previousRole: member.role },
  });

  revalidatePath("/dashboard/team");
}
