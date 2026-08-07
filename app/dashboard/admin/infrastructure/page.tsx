import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return <AdminSection operatorEmail={user.email} eyebrow="INFRAESTRUTURA · BIGCORPS" title="Infraestrutura" description="Atalhos para os componentes locais e de retenção." cards={[
      { eyebrow: "AGENT WINDOWS", title: "Instalação e Agents", description: "Acompanhar versão, computador e pareamento.", href: "/dashboard/installer" },
      { eyebrow: "DADOS", title: "Armazenamento", description: "Ver retenção, ativos e divergências.", href: "/dashboard/storage" },
      { eyebrow: "CÂMERAS", title: "Saúde visual", description: "Ver qualidade, drift e indisponibilidade.", href: "/dashboard/camera-health" },
      { eyebrow: "SUPORTE", title: "Diagnóstico seguro", description: "Exportar estado técnico sem credenciais RTSP.", href: "/dashboard/support" }
  ]} />;
}
