import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "../dashboard-hubs.module.css";

export const metadata = { title: "Administração" };
export const dynamic = "force-dynamic";

const cards = [
  ["EMPRESA", "Empresa e equipe", "Dados da organização, perfil e permissões.", "/dashboard/profile"],
  ["AGENT", "Instalação", "Download, pareamento, versão e diagnóstico do Agent.", "/dashboard/installer"],
  ["MEMÓRIA OPERACIONAL", "Perfis operacionais", "Revisar candidatos, correspondências e padrões aprovados.", "/dashboard/operational-profiles"],
  ["COMERCIAL", "Plano e cobrança", "Planos por câmera, faturas e pagamento por Pix.", "/dashboard/plans"],
  ["RETENÇÃO", "Armazenamento", "Histórico, imagens preservadas, clipes e uso por câmera.", "/dashboard/storage"],
  ["CONEXÕES", "Integrações", "Autorizações MCP, ChatGPT, Claude e revogação de acesso.", "/dashboard/profile/mcp-connections"],
] as const;

export default async function AdministrationHubPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  if (!new Set(["owner", "admin"]).has(organization.role)) redirect("/dashboard");
  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="administration" />
      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header"><div><span className="dashboard-eyebrow">ADMINISTRAÇÃO · {organization.name.toUpperCase()}</span><h1>Configurações da empresa</h1><p>As funções administrativas foram reunidas em um único lugar.</p></div></header>
        <div className={styles.gridWide}>{cards.map(([eyebrow,title,description,href]) => <Link className={styles.card} href={href} key={href}><span>{eyebrow}</span><h2>{title}</h2><p>{description}</p><strong>Abrir →</strong></Link>)}</div>
      </section>
    </main>
  );
}
