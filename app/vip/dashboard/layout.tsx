import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getVipProjectForOrganization } from "@/src/vip/server";
import styles from "./vip-dashboard.module.css";

export const metadata = {
  title: "MonitorIA VIP",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function VipDashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const admin = createAdminClient();
  const { count, error } = await admin.from("vip_projects").select("id", { count: "exact", head: true }).eq("organization_id", organization.id).eq("status", "active");
  if (error) throw new Error(`vip_active_projects_unavailable:${error.message}`);

  if (!count) {
    const current = await getVipProjectForOrganization(organization.id);
    if (!current) redirect("/dashboard");
    if (["trial_completed", "proposal", "payment_pending"].includes(current.status)) redirect("/vip/closing");
    if (current.status !== "cancelled") redirect("/vip/onboarding");
    redirect("/dashboard");
  }

  return (
    <main className={styles.app}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href="/vip/dashboard">Monitor<span>IA</span><b>VIP</b></Link>
        <div className={styles.org}>
          <span>ORGANIZAÇÃO</span>
          <strong>{organization.name}</strong>
          <small>{user.email ?? "Conta MonitorIA"}</small>
        </div>
        <nav>
          <Link href="/vip/dashboard">Visão executiva</Link>
          <Link href="/dashboard/search">Pesquisa IA</Link>
          <Link href="/dashboard/events">Acontecimentos</Link>
          <Link href="/dashboard/camera-health">Saúde das câmeras</Link>
          <Link href="/dashboard/recordings">Gravações</Link>
          <Link href="/vip/dashboard/beta">Laboratório VIP</Link>
        </nav>
        <div className={styles.sidebarBottom}>
          <Link href="/dashboard/cameras">Configurar câmeras</Link>
          <Link href="/dashboard/administration">Equipe</Link>
          <Link href="/dashboard/profile">Conta e segurança</Link>
        </div>
      </aside>
      <section className={styles.main}>{children}</section>
    </main>
  );
}
