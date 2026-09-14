import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return (
    <AdminSection
      operatorEmail={user.email}
      active="audit"
      eyebrow="AUDITORIA · BIGCORPS"
      title="Auditoria"
      description="Acessos, evidências, revisões humanas e rastreabilidade operacional."
      cards={[
        { eyebrow: "MCP", title: "Conexões MCP", description: "Autorizações, clientes conectados e revogação.", href: "/dashboard/profile/mcp-connections" },
        { eyebrow: "EVENTOS", title: "Revisões de eventos", description: "Abrir evidências e correções humanas.", href: "/dashboard/events" },
        { eyebrow: "PERFIS", title: "Perfis operacionais", description: "Correspondências probabilísticas e versões.", href: "/dashboard/operational-profiles" },
        { eyebrow: "RELEASE", title: "Gate de produção", description: "Avaliação auditável da versão 1.0.3.", href: "/dashboard/admin/launch" }
      ]}
    />
  );
}
