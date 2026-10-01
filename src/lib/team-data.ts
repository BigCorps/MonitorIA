import { createAdminClient } from "@/src/lib/supabase/admin";

export type TeamRole = "owner" | "admin" | "operator" | "viewer";

export type TeamMember = {
  userId: string;
  email: string;
  fullName: string;
  role: TeamRole;
  createdAt: string;
};

export type PendingTeamInvitation = {
  id: string;
  email: string;
  role: Exclude<TeamRole, "owner">;
  expiresAt: string;
  createdAt: string;
};

function metadataName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const fullName = (value as Record<string, unknown>).full_name;
  return typeof fullName === "string" ? fullName : "";
}

export async function getOrganizationTeam(organizationId: string) {
  const admin = createAdminClient();

  const [{ data: memberships, error: memberError }, { data: invites, error: inviteError }] =
    await Promise.all([
      admin
        .from("organization_members")
        .select("user_id,role,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      admin
        .from("organization_invitations")
        .select("id,email,role,expires_at,created_at")
        .eq("organization_id", organizationId)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    ]);

  if (memberError) throw new Error(`team_members_load_failed:${memberError.message}`);
  if (inviteError && !["42P01", "PGRST205"].includes(inviteError.code ?? "")) {
    throw new Error(`team_invites_load_failed:${inviteError.message}`);
  }

  const members: TeamMember[] = [];

  for (const membership of memberships ?? []) {
    const userId = String(membership.user_id);
    const { data } = await admin.auth.admin.getUserById(userId);
    const authUser = data.user;

    members.push({
      userId,
      email: String(authUser?.email ?? ""),
      fullName: metadataName(authUser?.user_metadata),
      role: String(membership.role) as TeamRole,
      createdAt: String(membership.created_at),
    });
  }

  return {
    members,
    invitationsTableReady: !inviteError,
    invitations: (invites ?? []).map((invite) => ({
      id: String(invite.id),
      email: String(invite.email),
      role: String(invite.role) as PendingTeamInvitation["role"],
      expiresAt: String(invite.expires_at),
      createdAt: String(invite.created_at),
    })),
  };
}
