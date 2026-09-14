import Link from "next/link";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getAdminOverviewData } from "@/src/lib/admin-overview-data";
import {
  AdminMetric,
  AdminShell,
  RelativeTime,
} from "./admin-shell";
import styles from "./admin.module.css";

export const metadata = { title: "Admin MonitorIA" };
export const dynamic = "force-dynamic";

function number(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

const severityLabel = {
  high: "Alta",
  medium: "Média",
  low: "Baixa",
} as const;

export default async function AdminPage() {
  const user = await requireInternalOperator();
  const data = await getAdminOverviewData();

  return (
    <AdminShell
      admin={{ email: user.email }}
      active="overview"
      eyebrow="OPERAÇÃO DA PLATAFORMA"
      title="Visão geral"
      description="Clientes, câmeras, receita, trials, Agents e sinais que exigem atenção em um único painel."
      actions={
        <span className={styles.updatedAt}>
          Atualizado às{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(data.generatedAt))}
        </span>
      }
    >
      <section className={styles.metricsGrid}>
        <AdminMetric title="Clientes" value={number(data.summary.organizations)} subtitle={`${number(data.summary.organizations30d)} novos em 30 dias`} />
        <AdminMetric title="Câmeras com sinal" value={number(data.summary.camerasRecent)} subtitle={`${number(data.summary.cameras)} cadastradas`} emphasized />
        <AdminMetric title="Agents online" value={number(data.summary.agentsOnline)} subtitle={data.summary.agentsStale ? `${number(data.summary.agentsStale)} sem heartbeat recente` : "heartbeat em dia"} />
        <AdminMetric title="Assinaturas" value={number(data.summary.activeSubscriptions)} subtitle="ativas" />
        <AdminMetric title="Trials rodando" value={number(data.summary.runningTrials)} subtitle={`${number(data.summary.convertedTrials30d)} conversões em 30d`} />
        <AdminMetric title="Receita no mês" value={money(data.summary.revenueMonthCents)} subtitle="faturas pagas" />
        <AdminMetric title="Pix pendentes" value={number(data.summary.pendingPix)} subtitle="aguardando confirmação" />
        <AdminMetric title="Atenções" value={number(data.summary.openHealthIncidents + data.summary.openAiAlerts + data.summary.agentsStale)} subtitle="saúde, IA e infraestrutura" />
      </section>

      <section className={styles.primaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span>CLIENTES</span><h2>Organizações e operação</h2><p>Visão rápida da base, câmeras e assinaturas.</p></div>
            <Link href="/dashboard/admin/customers">Abrir clientes →</Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Organização</th><th>Status</th><th>Câmeras</th><th>Assinaturas</th><th>Último sinal</th></tr></thead>
              <tbody>
                {data.organizations.slice(0, 12).map((org) => (
                  <tr key={org.id}>
                    <td><strong>{org.name}</strong><small>{org.planCode}</small></td>
                    <td><span className={`${styles.statusBadge} ${org.status === "online" ? styles.statusHealthy : org.status === "attention" ? styles.statusWarning : styles.statusNeutral}`}>{org.status === "online" ? "Com sinal" : org.status === "attention" ? "Atenção" : "Sem sinal recente"}</span></td>
                    <td>{org.cameras}</td><td>{org.activeSubscriptions}</td><td><RelativeTime value={org.lastCameraSeenAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><span>RELEASE 1.0.3</span><h2>Estado da produção</h2><p>Última avaliação registrada pelo gate interno.</p></div>
            <Link href="/dashboard/admin/launch">Detalhes →</Link>
          </div>
          <div className={`${styles.releaseHero} ${data.release.status === "ready" ? styles.releaseReady : data.release.status === "blocked" ? styles.releaseBlocked : styles.releaseNeutral}`}>
            <strong>{data.release.status === "ready" ? "Pronto" : data.release.status === "blocked" ? "Bloqueado" : "Não avaliado"}</strong>
            <span>{data.release.passedCount} aprovados · {data.release.warningCount} atenções · {data.release.blockedCount} bloqueios</span>
          </div>
          <div className={styles.releaseStats}>
            <div><span>Cadastro geral</span><strong>{data.release.generalSignupEnabled ? "Aberto" : "Fechado"}</strong></div>
            <div><span>Commit</span><strong>{data.release.commitSha?.slice(0, 10) ?? "—"}</strong></div>
            <div><span>Avaliado</span><strong><RelativeTime value={data.release.evaluatedAt} /></strong></div>
          </div>
        </article>
      </section>

      <section className={styles.secondaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>ATENÇÃO</span><h2>Prioridades acionáveis</h2><p>O que merece revisão primeiro.</p></div><Link href="/dashboard/admin/attention">Ver tudo →</Link></div>
          <div className={styles.attentionList}>
            {data.attention.length ? data.attention.slice(0, 8).map((item) => (
              <Link href={item.href} className={styles.attentionRow} key={item.id}>
                <span className={`${styles.severityDot} ${item.severity === "high" ? styles.severityHigh : item.severity === "medium" ? styles.severityMedium : styles.severityLow}`} />
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <aside><span>{severityLabel[item.severity]}</span><small><RelativeTime value={item.occurredAt} /></small></aside>
              </Link>
            )) : <div className={styles.emptyState}>Nenhuma atenção aberta neste momento.</div>}
          </div>
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeader}><div><span>AGORA</span><h2>Linha do tempo operacional</h2><p>Cadastros, pagamentos e conversões recentes.</p></div></div>
          <div className={styles.activityList}>
            {data.activity.map((item) => (
              <div className={styles.activityRow} key={item.id}>
                <span className={styles.activityDot} />
                <div><strong>{item.title}</strong><p>{item.detail}</p></div>
                <aside>{item.amountCents !== null ? <strong>{money(item.amountCents)}</strong> : null}<small><RelativeTime value={item.occurredAt} /></small></aside>
              </div>
            ))}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
