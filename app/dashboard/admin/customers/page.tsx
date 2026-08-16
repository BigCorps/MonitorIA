import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return <AdminSection operatorEmail={user.email} eyebrow="CLIENTES · BIGCORPS" title="Clientes" description="Atalhos comerciais iniciais para a organização selecionada." cards={[
      { eyebrow: "PLANOS", title: "Planos por câmera", description: "Configuração comercial e desconto progressivo.", href: "/dashboard/plans" },
      { eyebrow: "FINANCEIRO", title: "Cobranças", description: "Faturas, Pix e ciclos de pagamento.", href: "/dashboard/billing" },
      { eyebrow: "CONVERSÃO", title: "Teste grátis", description: "Acompanhar preparação, execução e conversão do trial.", href: "/dashboard/trial" },
      { eyebrow: "DEMONSTRAÇÃO", title: "Trial comercial assistido", description: "Gerar links de 60 minutos para até seis câmeras.", href: "/dashboard/admin/customers/trials" }
  ]} />;
}
