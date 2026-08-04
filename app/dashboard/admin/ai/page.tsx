import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return <AdminSection operatorEmail={user.email} eyebrow="IA E CUSTOS · BIGCORPS" title="IA e custos" description="Controle interno de modelos, consumo, margem e validação visual." cards={[
      { eyebrow: "MARGEM", title: "Controle de IA e margem", description: "Custos, projeções, limites e alertas por câmera.", href: "/dashboard/operations/ai" },
      { eyebrow: "HOMOLOGAÇÃO", title: "Testes de visão", description: "Experimentos e validações dos modelos de análise.", href: "/dashboard/vision-tests" }
  ]} />;
}
