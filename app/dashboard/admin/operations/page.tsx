import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return (
    <AdminSection
      operatorEmail={user.email}
      active="operations"
      eyebrow="OPERAÇÃO · BIGCORPS"
      title="Operação"
      description="Eventos, saúde das câmeras, incidentes e estado dos Agents."
      cards={[
        { eyebrow: "TEMPO REAL", title: "Acontecimentos", description: "Abrir a linha do tempo e revisar o que está sendo registrado.", href: "/dashboard/events" },
        { eyebrow: "CONFIABILIDADE", title: "Funcionamento das câmeras", description: "Incidentes, referências visuais, qualidade e indisponibilidade.", href: "/dashboard/camera-health" },
        { eyebrow: "ALERTAS", title: "Incidentes operacionais", description: "Condições críticas, reconhecimento e resolução.", href: "/dashboard/operations" },
        { eyebrow: "AGENT", title: "Agents e instalação", description: "Versão, pareamento, computador e diagnóstico.", href: "/dashboard/installer" },
        { eyebrow: "PESQUISA", title: "Pesquisa IA", description: "Consultar a memória operacional com linguagem natural.", href: "/dashboard/search" },
        { eyebrow: "SESSÕES", title: "Sessões operacionais", description: "Acompanhar ciclos de abertura, fechamento e atividade.", href: "/dashboard/sessions" }
      ]}
    />
  );
}
