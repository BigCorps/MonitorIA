import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { AdminMetric, AdminShell, RelativeTime } from "../admin-shell";
import styles from "../admin.module.css";

export const metadata = { title: "Financeiro | Admin MonitorIA" };
export const dynamic = "force-dynamic";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}
function monthStartIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export default async function AdminFinancePage() {
  const user = await requireInternalOperator();
  const admin = createAdminClient();
  const monthStart = monthStartIso();

  const [invoicesResult, pixResult, subscriptionsResult, organizationsResult] = await Promise.all([
    admin.from("billing_invoices").select("id,organization_id,status,total_cents,paid_at,created_at").order("created_at", { ascending: false }).limit(250),
    admin.from("billing_pix_payments").select("id,organization_id,status,amount_cents,confirmed_at,error_code,error_message,created_at,updated_at").order("created_at", { ascending: false }).limit(250),
    admin.from("camera_subscriptions").select("organization_id,status,plan_code,activated_at,created_at"),
    admin.from("organizations").select("id,name"),
  ]);

  const firstError = [invoicesResult.error, pixResult.error, subscriptionsResult.error, organizationsResult.error].find(Boolean);
  if (firstError) throw new Error(`admin_finance_unavailable:${firstError.message}`);

  const invoices = invoicesResult.data ?? [];
  const pix = pixResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const orgName = new Map((organizationsResult.data ?? []).map((row: any) => [String(row.id), String(row.name ?? "Organização")]));

  const paidMonth = invoices.filter((row: any) => row.status === "paid" && row.paid_at && String(row.paid_at) >= monthStart);
  const revenueMonth = paidMonth.reduce((total: number, row: any) => total + Number(row.total_cents ?? 0), 0);
  const activeSubs = subscriptions.filter((row: any) => ["active", "trialing", "grace"].includes(String(row.status)));
  const payingOrgIds = new Set(paidMonth.map((row: any) => String(row.organization_id)));
  const pendingPix = pix.filter((row: any) => ["pending", "created", "waiting", "processing"].includes(String(row.status)));
  const failedPix = pix.filter((row: any) => ["failed", "error", "expired", "cancelled"].includes(String(row.status)));
  const recentPayments = invoices.filter((row: any) => row.status === "paid" && row.paid_at).slice(0, 30);

  return (
    <AdminShell admin={{ email: user.email }} active="finance" eyebrow="RECEITA · BIGCORPS" title="Financeiro" description="Faturamento do MonitorIA, pagamentos confirmados, cobranças pendentes e base pagante.">
      <section className={styles.metricsGrid}>
        <AdminMetric title="Receita no mês" value={money(revenueMonth)} subtitle="faturas pagas" emphasized />
        <AdminMetric title="Pagamentos" value={paidMonth.length} subtitle="confirmados no mês" />
        <AdminMetric title="Clientes pagantes" value={payingOrgIds.size} subtitle="organizações no mês" />
        <AdminMetric title="Assinaturas" value={activeSubs.length} subtitle="ativas" />
        <AdminMetric title="Pix pendentes" value={pendingPix.length} subtitle="aguardando confirmação" />
        <AdminMetric title="Pix com falha" value={failedPix.length} subtitle="histórico recente" />
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}><div><span>PAGAMENTOS</span><h2>Recebimentos recentes</h2><p>Somente faturamento do MonitorIA confirmado.</p></div></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Cliente</th><th>Status</th><th>Valor</th><th>Quando</th></tr></thead>
            <tbody>
              {recentPayments.map((row: any) => (
                <tr key={row.id}>
                  <td><strong>{orgName.get(String(row.organization_id)) ?? "Organização"}</strong></td>
                  <td><span className={`${styles.statusBadge} ${styles.statusHealthy}`}>Pago</span></td>
                  <td>{money(Number(row.total_cents ?? 0))}</td>
                  <td><RelativeTime value={String(row.paid_at)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
