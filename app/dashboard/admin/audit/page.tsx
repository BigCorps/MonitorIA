import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return <AdminSection operatorEmail={user.email} eyebrow="AUDITORIA · BIGCORPS" title="Auditoria" description="Acessos, evidências e pontos de revisão da organização selecionada." cards={[
      { eyebrow: "MCP", title: "Conexões MCP", description: "Autorizações, clientes conectados e revogação.", href: "/dashboard/profile/mcp-connections" },
      { eyebrow: "EVENTOS", title: "Revisões de eventos", description: "Abrir evidências e correções humanas.", href: "/dashboard/events" },
      { eyebrow: "PERFIS", title: "Perfis operacionais", description: "Revisar correspondências probabilísticas e versões.", href: "/dashboard/operational-profiles" }
  ]} />;
}
