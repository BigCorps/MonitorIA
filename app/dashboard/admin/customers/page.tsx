import { requireInternalOperator } from "@/src/lib/internal-operator";
import { AdminSection } from "../admin-section";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireInternalOperator();
  return (
    <AdminSection
      operatorEmail={user.email}
      active="customers"
      eyebrow="CLIENTES · BIGCORPS"
      title="Clientes"
      description="Planos, cobranças, trials e acompanhamento comercial do MonitorIA."
      cards={[
        { eyebrow: "FINANCEIRO", title: "Financeiro global", description: "Receita, pagamentos, pendências e base pagante.", href: "/dashboard/admin/finance" },
        { eyebrow: "PLANOS", title: "Planos por câmera", description: "Configuração comercial e desconto progressivo.", href: "/dashboard/plans" },
        { eyebrow: "COBRANÇAS", title: "Cobranças da organização", description: "Faturas, Pix e ciclos de pagamento.", href: "/dashboard/billing" },
        { eyebrow: "CONVERSÃO", title: "Teste grátis", description: "Preparação, execução e conversão do trial self-service.", href: "/dashboard/trial" },
        { eyebrow: "DEMONSTRAÇÃO", title: "Trial comercial assistido", description: "Links de 60 minutos para até seis câmeras e funil de vendas.", href: "/dashboard/admin/customers/trials" }
      ]}
    />
  );
}
