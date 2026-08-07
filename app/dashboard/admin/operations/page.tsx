import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return <AdminSection operatorEmail={user.email} eyebrow="OPERAÇÕES · BIGCORPS" title="Operações" description="Atalhos iniciais para acompanhar a execução diária do MonitorIA." cards={[
      { eyebrow: "TEMPO REAL", title: "Eventos", description: "Abrir a linha do tempo da organização atualmente selecionada.", href: "/dashboard/events" },
      { eyebrow: "CONFIABILIDADE", title: "Saúde das câmeras", description: "Acompanhar incidentes, baselines e qualidade visual.", href: "/dashboard/camera-health" },
      { eyebrow: "ALERTAS", title: "Incidentes operacionais", description: "Acompanhar condições críticas, reconhecimento e resolução.", href: "/dashboard/operations" },
      { eyebrow: "AGENT", title: "Agents e instalação", description: "Versões, pareamento e diagnóstico do Agent.", href: "/dashboard/installer" }
  ]} />;
}
