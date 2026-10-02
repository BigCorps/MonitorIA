import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getVipDashboardForOrganization } from "@/src/vip/dashboard";
import styles from "./vip-dashboard.module.css";

export const dynamic = "force-dynamic";

function kindLabel(value: string) {
  return ({ enterprise: "Grande empresa", large_monitoring: "Operação de monitoramento", scientific: "Projeto científico", other: "Projeto especial" } as Record<string,string>)[value] ?? "Projeto VIP";
}
function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "medium" }).format(new Date(value));
}

export default async function VipDashboardPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  const data = await getVipDashboardForOrganization(organization.id);
  if (!data.projects.length) redirect("/vip/onboarding");

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span>MONITORIA VIP · OPERAÇÃO</span>
          <h1>Visão executiva dos seus Projetos</h1>
          <p>Capacidade contratada, locais, câmeras, inteligência e saúde operacional em uma camada única, com todo o processamento técnico em modo Intensive.</p>
        </div>
        <Link className={styles.goldButton} href="/dashboard/search">Perguntar à operação</Link>
      </header>

      <section className={styles.metrics}>
        <article><span>PROJETOS</span><strong>{data.projectsCount}</strong><small>ativos</small></article>
        <article><span>CÂMERAS</span><strong>{data.activeCameras}/{data.contractedCameras}</strong><small>{data.remainingCapacity} vaga(s)</small></article>
        <article><span>LOCAIS</span><strong>{data.activeSites}</strong><small>vinculados</small></article>
        <article><span>ÚLTIMAS 24H</span><strong>{data.events24h}</strong><small>acontecimentos</small></article>
        <article><span>PESQUISA IA</span><strong>{data.assistantRemaining ?? "∞"}</strong><small>interações no ciclo</small></article>
        <article><span>AGENTS</span><strong>{data.agentsOnline}</strong><small>online</small></article>
      </section>

      <section className={styles.aiHero}>
        <div>
          <span>PESQUISA IA · MOTOR MÁXIMO 2.0</span>
          <h2>Pergunte à operação inteira em linguagem natural.</h2>
          <p>Compare câmeras, investigue períodos, consulte saúde, rotinas, processos e continuidades entre ambientes.</p>
        </div>
        <div className={styles.aiActions}>
          <Link href="/dashboard/search">Abrir Pesquisa IA</Link>
          <Link href="/dashboard/profile/mcp-connections">Conectar outra IA via MCP</Link>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><span>PROJETOS VIP</span><h2>Operações contratadas</h2></div>
          <Link href="/vip/dashboard/beta">Laboratório VIP →</Link>
        </div>
        <div className={styles.projectGrid}>
          {data.projects.map((project) => {
            const utilization = project.contractedCameras ? Math.min(100, Math.round((project.activeCameras / project.contractedCameras) * 100)) : 0;
            return (
              <article className={styles.projectCard} key={project.id}>
                <div className={styles.projectTop}>
                  <div><span>{kindLabel(project.projectKind)}</span><h3>{project.name}</h3><small>{project.companyName}</small></div>
                  <b>{project.planCode.replace("vip", "VIP ")}</b>
                </div>
                <div className={styles.capacity}>
                  <div><span>CAPACIDADE</span><strong>{project.activeCameras}/{project.contractedCameras}</strong></div>
                  <div className={styles.track}><i style={{ width: `${utilization}%` }} /></div>
                  <small>{project.remainingCapacity} vaga(s) · {project.activeSites} local(is)</small>
                </div>
                <div className={styles.projectFacts}>
                  <span>{project.billingCycle === "annual" ? "Anual" : "Mensal"}</span>
                  <span>{project.enabledFeatures} recurso(s) VIP</span>
                  <span>até {date(project.periodEnd)}</span>
                </div>
                <Link className={styles.projectLink} href={`/vip/dashboard/projects/${project.id}`}>Abrir Projeto →</Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className={styles.quickGrid}>
        <Link href="/dashboard/events"><span>ACONTECIMENTOS</span><strong>Linha do tempo operacional</strong><small>Abra eventos, evidências e revisões.</small></Link>
        <Link href="/dashboard/camera-health"><span>SAÚDE</span><strong>Câmeras e disponibilidade</strong><small>Veja degradação e problemas técnicos.</small></Link>
        <Link href="/dashboard/recordings"><span>CIÊNCIA / ARQUIVOS</span><strong>Analisar gravações locais</strong><small>Gravações VIP recebem entitlement Intensive.</small></Link>
      </section>
    </div>
  );
}
