import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { appConfig } from "@/src/lib/app-config";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { supportErrorCatalog } from "@/src/lib/support-error-catalog";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import styles from "../operations/operations.module.css";

export const metadata = { title: "Suporte" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="profile" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div><span className="dashboard-eyebrow">SUPORTE · {organization.name.toUpperCase()}</span><h1>Diagnóstico e ajuda</h1><p>Resolva situações comuns ou envie um diagnóstico técnico sem compartilhar a senha da câmera.</p></div>
          <a className="panel-primary-action" href={appConfig.whatsappUrl} target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>
        </header>
        <DashboardSectionTabs group="settings" />
        <div className={styles.notice}>
          <h2>Diagnóstico seguro</h2>
          <p>O arquivo inclui versões, estados, horários e códigos de erro. Ele não inclui RTSP, IP, tokens, imagens, vídeos ou dados bancários.</p>
          <p><a className={styles.download} href="/api/support/diagnostics">Baixar diagnóstico em JSON</a></p>
        </div>
        <div className={styles.cards}>
          {supportErrorCatalog.map((entry) => <article className={styles.card} key={entry.code}><span className={styles.eyebrow}>{entry.code}</span><h2>{entry.title}</h2><p>{entry.action}</p></article>)}
        </div>
        <div className={styles.notice}><h2>Guias completos</h2><p><Link href="/ajuda">Abrir central de ajuda e guias por fabricante</Link> · <Link href="/status">Ver status dos serviços</Link></p></div>
      </section>
    </main>
  );
}

