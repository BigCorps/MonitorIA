import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getAdminOverviewData } from "@/src/lib/admin-overview-data";
import { AdminMetric, AdminShell, RelativeTime } from "../admin-shell";
import styles from "../admin.module.css";

export const metadata = { title: "Atenção | Admin MonitorIA" };
export const dynamic = "force-dynamic";

const categoryLabel = { camera: "Câmera", agent: "Agent", billing: "Financeiro", ai: "IA", trial: "Trial" } as const;

export default async function AdminAttentionPage() {
  const user = await requireInternalOperator();
  const data = await getAdminOverviewData();
  const high = data.attention.filter((item) => item.severity === "high").length;
  const medium = data.attention.filter((item) => item.severity === "medium").length;

  return (
    <AdminShell admin={{ email: user.email }} active="attention" eyebrow="PRIORIDADES ACIONÁVEIS" title="Atenção" description="Saúde de câmeras, Agents, cobranças e alertas de IA que merecem revisão operacional.">
      <section className={styles.metricsGrid}>
        <AdminMetric title="Total" value={data.attention.length} subtitle="sinais priorizados" />
        <AdminMetric title="Alta" value={high} subtitle="revisar primeiro" emphasized />
        <AdminMetric title="Média" value={medium} />
        <AdminMetric title="Câmeras" value={data.summary.openHealthIncidents} subtitle="incidentes abertos" />
        <AdminMetric title="Agents" value={data.summary.agentsStale} subtitle="heartbeat atrasado" />
        <AdminMetric title="Financeiro" value={data.summary.pendingPix} subtitle="Pix pendentes" />
        <AdminMetric title="IA" value={data.summary.openAiAlerts} subtitle="alertas abertos" />
      </section>

      <section className={styles.attentionPageList}>
        {data.attention.length ? data.attention.map((item) => (
          <Link href={item.href} key={item.id} className={`${styles.attentionCard} ${item.severity === "high" ? styles.attentionHigh : item.severity === "medium" ? styles.attentionMedium : styles.attentionLow}`}>
            <div><div className={styles.attentionMeta}><span>{item.severity === "high" ? "Alta" : item.severity === "medium" ? "Média" : "Baixa"}</span><small>{categoryLabel[item.category]}</small></div><h2>{item.title}</h2><p>{item.detail}</p></div>
            <aside><RelativeTime value={item.occurredAt} /><strong>Abrir →</strong></aside>
          </Link>
        )) : <div className={styles.emptyState}>Nenhuma atenção aberta neste momento.</div>}
      </section>
    </AdminShell>
  );
}
