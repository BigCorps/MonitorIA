import type { McpAuthContext } from "./auth";
import { createEnvelope } from "./envelope";
import { resolveOrganizationId } from "./grants";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function timezoneForScope(
  context: McpAuthContext,
  organizationId: string,
  siteId?: string,
) {
  let query = context.supabase
    .from("sites")
    .select("timezone")
    .eq("organization_id", organizationId);

  if (siteId) query = query.eq("id", siteId);

  const { data } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.timezone ? String(data.timezone) : "America/Sao_Paulo";
}

async function capabilities(
  context: McpAuthContext,
  organizationId: string,
) {
  const { data } = await context.supabase.rpc("mcp_get_capabilities", {
    p_organization_id: organizationId,
  });

  return objectValue(data);
}

export async function getOperationPatterns(
  context: McpAuthContext,
  args: {
    organization_id?: string;
    site_id?: string;
    camera_id?: string;
  },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );

  const { data, error } = await context.supabase.rpc(
    "assistant_staff_operational_profile_summary_v1",
    {
      p_organization_id: organizationId,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
    },
  );

  if (error) throw new Error("operation_patterns_failed");

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(
      context,
      organizationId,
      args.site_id,
    ),
    data: {
      operation_patterns: data,
    },
    capabilities: await capabilities(context, organizationId),
    limitations: [
      "Padrões da operação descrevem recorrências observadas; não confirmam identidade de uma pessoa.",
      "O MonitorIA não usa reconhecimento facial nem biometria para criar esses padrões.",
      "Correções humanas ajudam análises futuras, mas mudanças em padrões aprovados dependem de revisão do administrador.",
      "Uniformes semelhantes, baixa resolução, oclusão e mudanças de rotina podem gerar incerteza.",
    ],
  });
}
