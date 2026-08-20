import type { McpAuthContext } from "./auth";
import { createEnvelope } from "./envelope";
import { resolveOrganizationId } from "./grants";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function range(from?: string, to?: string) {
  const end = to ? new Date(to) : new Date();
  const start = from
    ? new Date(from)
    : new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start.getTime() >= end.getTime()
  ) {
    throw new Error("invalid_date_range");
  }

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
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

export async function getProcessSummary(
  context: McpAuthContext,
  args: {
    organization_id?: string;
    site_id?: string;
    camera_id?: string;
    from?: string;
    to?: string;
  },
) {
  const organizationId = resolveOrganizationId(
    context,
    args.organization_id,
  );
  const selectedRange = range(args.from, args.to);

  const { data, error } = await context.supabase.rpc(
    "assistant_operational_process_summary_v1",
    {
      p_organization_id: organizationId,
      p_from: selectedRange.from,
      p_to: selectedRange.to,
      p_camera_id: args.camera_id || null,
      p_site_id: args.site_id || null,
    },
  );

  if (error) throw new Error("process_summary_failed");

  return createEnvelope({
    organizationId,
    timezone: await timezoneForScope(context, organizationId, args.site_id),
    data: {
      range: selectedRange,
      processes: data,
    },
    capabilities: await capabilities(context, organizationId),
    limitations: [
      "Modelos padrão organizam observações e não representam uma regra operacional declarada pelo cliente.",
      "Somente processos personalizados podem gerar diferenças acionáveis por etapa obrigatória.",
      "Ausência de confirmação visual não prova que uma etapa não aconteceu.",
      "Processos personalizados são versionados e nunca são alterados automaticamente por sugestões de refinamento.",
    ],
  });
}
