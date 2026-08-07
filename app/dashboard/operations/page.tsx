import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getOperationalAlertOverview } from "@/src/lib/operations-data";
import { supportErrorEntry } from "@/src/lib/support-error-catalog";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import {
  acknowledgeOperationalAlertAction,
  resolveOperationalAlertAction,
} from "./actions";
import styles from "./operations.module.css";

export const metadata = { title: "Alertas operacionais" };
export const dynamic = "force-dynamic";

const severityLabel = { critical: "Crítico", warning: "Atenção", info: "Informativo" };

export default async function OperationsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  const overview = await getOperationalAlertOverview(organization.id);
  const canManage = ["owner", "admin"].includes(organization.role);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="intelligence" />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">OPERAÇÃO · {organization.name.toUpperCase()}</span>
            <h1>Alertas operacionais</h1>
            <p>Condições críticas são detectadas, agrupadas e resolvidas automaticamente quando voltam ao normal.</p>
          </div>
          <Link className="panel-primary-action" href="/dashboard/support">Abrir suporte</Link>
        </header>
        <DashboardSectionTabs group="monitoring" />

        <section className={styles.summaryGrid} aria-label="Resumo dos alertas">
          <article><strong>{overview.counts.critical}</strong><span>críticos</span></article>
          <article><strong>{overview.counts.warning}</strong><span>pedem atenção</span></article>
          <article><strong>{overview.counts.acknowledged}</strong><span>em tratamento</span></article>
        </section>

        <section>
          <div className={styles.sectionHeader}><div><span>ESTADO ATUAL</span><h2>Incidentes ativos</h2></div></div>
          {overview.active.length ? (
            <div className={styles.cards}>
              {overview.active.map((alert) => {
                const guidance = supportErrorEntry(alert.code);
                return (
                  <article className={`${styles.card} ${styles[alert.status] ?? ""}`} key={alert.id}>
                    <header>
                      <div>
                        <span className={styles.eyebrow}>{[alert.siteName, alert.cameraName ?? alert.agentName].filter(Boolean).join(" · ") || "Organização"}</span>
                        <h3>{alert.title}</h3>
                      </div>
                      <span className={`${styles.badge} ${styles[alert.severity]}`}>{severityLabel[alert.severity]}</span>
                    </header>
                    <p>{alert.summary}</p>
                    {guidance ? <p><strong>Próxima ação:</strong> {guidance.action}</p> : null}
                    <footer>
                      <span className={styles.muted}>Última ocorrência: {new Date(alert.lastObservedAt).toLocaleString("pt-BR")} · {alert.occurrenceCount} verificação(ões)</span>
                      {canManage ? (
                        <div className={styles.actions}>
                          {alert.status === "open" ? <form action={acknowledgeOperationalAlertAction}><input type="hidden" name="alert_id" value={alert.id} /><button type="submit">Marcar em tratamento</button></form> : null}
                          <form action={resolveOperationalAlertAction}><input type="hidden" name="alert_id" value={alert.id} /><button type="submit">Resolver</button></form>
                        </div>
                      ) : null}
                    </footer>
                  </article>
                );
              })}
            </div>
          ) : <div className={styles.empty}><h3>Nenhum incidente ativo</h3><p className={styles.muted}>As automações continuarão verificando a operação em segundo plano.</p></div>}
        </section>
      </section>
    </main>
  );
}

