import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return (
    <AdminSection
      operatorEmail={user.email}
      active="infrastructure"
      eyebrow="INFRAESTRUTURA · BIGCORPS"
      title="Infraestrutura"
      description="Agent, armazenamento, saúde visual, retenção e diagnóstico seguro."
      cards={[
        { eyebrow: "AGENT 1.0.3", title: "Instalação e Agents", description: "Versão, computador, pareamento e estado do Agent.", href: "/dashboard/installer" },
        { eyebrow: "DADOS", title: "Armazenamento", description: "Retenção, ativos e divergências de armazenamento.", href: "/dashboard/storage" },
        { eyebrow: "CÂMERAS", title: "Saúde visual", description: "Qualidade, drift, congelamento e indisponibilidade.", href: "/dashboard/camera-health" },
        { eyebrow: "SUPORTE", title: "Diagnóstico seguro", description: "Estado técnico sem expor credenciais RTSP.", href: "/dashboard/support" },
        { eyebrow: "STATUS", title: "Status público", description: "Verifique a página pública de disponibilidade.", href: "/status" }
      ]}
    />
  );
}
