import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "../dashboard-hubs.module.css";

export const metadata = { title: "Acontecimentos" };
export const dynamic = "force-dynamic";

export default async function ActivityHubPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="activity" />
      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header"><div><span className="dashboard-eyebrow">ACONTECIMENTOS · {organization.name.toUpperCase()}</span><h1>O que aconteceu nas câmeras</h1><p>Consulte eventos individuais ou histórias completas reconstruídas em sessões.</p></div></header>
        <div className={styles.grid}>
          <Link className={styles.card} href="/dashboard/events"><span>LINHA DO TEMPO</span><h2>Eventos</h2><p>Acontecimentos individuais, evidências, filtros e revisões.</p><strong>Abrir eventos →</strong></Link>
          <Link className={styles.card} href="/dashboard/sessions"><span>HISTÓRIAS OPERACIONAIS</span><h2>Sessões</h2><p>Capítulos relacionados, duração, participantes prováveis e resultado visual.</p><strong>Abrir sessões →</strong></Link>
        </div>
      </section>
    </main>
  );
}
