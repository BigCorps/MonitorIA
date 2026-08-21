import type { NextRequest } from "next/server";
import { hashAgentToken } from "@/src/lib/agent-security";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type AuthenticatedAgent = {
  id: string;
  organizationId: string;
  siteId: string;
  name: string;
  version: string;
  metadata: Record<string, unknown>;
};

export async function authenticateAgent(request: NextRequest): Promise<AuthenticatedAgent | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const token = authorization.slice(7).trim();
  if (!token) return null;

  let tokenHash: string;
  try {
    tokenHash = hashAgentToken(token);
  } catch {
    return null;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("id,organization_id,site_id,name,version,metadata")
    .eq("agent_token_hash", tokenHash)
    .neq("status", "disabled")
    .maybeSingle();

  if (error || !data) return null;

  const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? (data.metadata as Record<string, unknown>)
    : {};

  return {
    id: String(data.id),
    organizationId: String(data.organization_id),
    siteId: String(data.site_id),
    name: String(data.name),
    version: String(data.version ?? ""),
    metadata,
  };
}
