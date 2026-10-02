import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getVipDashboardForOrganization, getVipProjectWorkspace } from "@/src/vip/dashboard";
import { setVipFeatureAction } from "@/app/vip/dashboard/projects/[projectId]/actions";
import styles from "../vip-dashboard.module.css";

export const dynamic = "force-dynamic";
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function first(value: string | string[] | undefined) { return typeof value === "string" ? value : null; }

export default async function VipBetaPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");
  const [dashboard, query] = await Promise.all([getVipDashboardForOrganization(organization.id), searchParams]);
  if (!dashboard.projects.length) redirect("/vip/onboarding");
  const requested = first(query.project);
  const selected = dashboard.projects.find((project) => project.id === requested) ?? dashboard.projects[0];
  const workspace = await getVipProjectWorkspace(organization.id, selected.id);
  if (!workspace) redirect("/vip/dashboard");
  const canManage = ["owner", "admin"].includes(organization.role);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div><span>LABORATÓRIO VIP</span><h1>Recursos avançados com liberação controlada</h1><p>O VIP recebe primeiro melhorias validadas em operações acompanhadas antes de uma eventual promoção ao produto padrão.</p></div>
        <Link className={styles.goldButton} href={`/vip/dashboard/projects/${selected.id}`}>Voltar ao Projeto</Link>
      </header>
      <div className={styles.projectTabs}>{dashboard.projects.map((project) => <Link key={project.id} href={`/vip/dashboard/beta?project=${project.id}`} data-active={project.id === selected.id}>{project.name}</Link>)}</div>
      <section className={styles.betaNotice}><strong>{selected.name}</strong><p>Alterações afetam somente este Projeto. Desativar um recurso beta não altera contrato, câmeras ou dados já registrados.</p></section>
      <section className={styles.betaGrid}>
        {workspace.features.map((feature) => (
          <article key={feature.code} className={styles.betaCard}>
            <div className={styles.betaTop}><span data-stage={feature.stage}>{feature.stage}</span><b data-enabled={feature.enabled}>{feature.enabled ? "ATIVO" : "DESATIVADO"}</b></div>
            <h2>{feature.displayName}</h2><p>{feature.description}</p><small>{feature.source === "override" ? "Configuração específica deste Projeto." : "Padrão do catálogo VIP."}</small>
            {canManage ? <form action={setVipFeatureAction}><input type="hidden" name="project_id" value={selected.id} /><input type="hidden" name="feature_code" value={feature.code} /><input type="hidden" name="enabled" value={feature.enabled ? "false" : "true"} /><button type="submit">{feature.enabled ? "Desativar neste Projeto" : "Ativar neste Projeto"}</button></form> : null}
          </article>
        ))}
      </section>
    </div>
  );
}
