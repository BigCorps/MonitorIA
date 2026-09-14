import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return (
    <AdminSection
      operatorEmail={user.email}
      active="ai"
      eyebrow="IA & CUSTOS · BIGCORPS"
      title="IA & custos"
      description="Consumo, projeções, margem, roteamento e homologação dos modelos de visão."
      cards={[
        { eyebrow: "MARGEM", title: "Controle de IA e margem", description: "Custos, projeções, tetos e alertas por câmera.", href: "/dashboard/operations/ai" },
        { eyebrow: "HOMOLOGAÇÃO", title: "Testes de visão", description: "Experimentos e validações dos modelos de análise.", href: "/dashboard/vision-tests" },
        { eyebrow: "CRÉDITOS", title: "Pesquisa IA e créditos", description: "Consumo e saldo do assistente de pesquisa.", href: "/dashboard/assistant-credits" }
      ]}
    />
  );
}
