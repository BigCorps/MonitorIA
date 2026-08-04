import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "../dashboard-hubs.module.css";

export const metadata = { title: "Inteligência" };
export const dynamic = "force-dynamic";

export default async function IntelligenceHubPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="intelligence" />
      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header"><div><span className="dashboard-eyebrow">INTELIGÊNCIA · {organization.name.toUpperCase()}</span><h1>Padrões e processos observados</h1><p>Veja o que costuma acontecer e quais etapas foram confirmadas visualmente.</p></div></header>
        <div className={styles.grid}>
          <Link className={styles.card} href="/dashboard/routines"><span>PADRÕES</span><h2>Rotinas e desvios</h2><p>Faixas habituais, atrasos, antecipações e diferenças em relação ao histórico.</p><strong>Abrir rotinas →</strong></Link>
          <Link className={styles.card} href="/dashboard/processes"><span>ETAPAS</span><h2>Processos e ações</h2><p>Sequências observadas, etapas pendentes e resultados visuais.</p><strong>Abrir processos →</strong></Link>
        </div>
      </section>
    </main>
  );
}
