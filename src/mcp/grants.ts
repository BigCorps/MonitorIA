import type { McpAuthContext } from "./auth";

export function resolveOrganizationId(
  context: McpAuthContext,
  requested?: string,
) {
  if (requested) {
    if (!context.organizationIds.includes(requested)) {
      throw new Error("organization_not_authorized");
    }
    return requested;
  }

  if (context.organizationIds.length === 1) {
    return context.organizationIds[0] as string;
  }

  throw new Error("organization_id_required");
}

