import Link from "next/link";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import styles from "./vip-commercial.module.css";

export const metadata = { title: "Comercial VIP | MonitorIA" };
export const dynamic = "force-dynamic";

type ProjectRow = {
  id: string;
  company_name: string;
  lead_name: string;
  lead_email: string;
  project_kind: string;
  status: string;
  selected_plan_code: string;
  expected_camera_count: number;
  sales_operator_id: string;
  updated_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    lead: "Lead",
    invited: "Convite enviado",
    project_setup: "Estruturando projeto",
    installing: "Instalando",
    calibrating: "Calibrando",
    ready_for_trial: "Pronto para teste",
    trial_running: "Teste em andamento",
    trial_completed: "Preparar proposta",
    proposal: "Proposta apresentada",
    payment_pending: "Aguardando pagamento",
    active: "Ativo",
    cancelled: "Cancelado",
  };
  return labels[status] ?? status;
}

export default async function VipCommercialPage() {
  const access = await requireCommercialAccess();
  const admin = createAdminClient();

  let projectQuery = admin
    .from("vip_projects")
    .select(
      "id,company_name,lead_name,lead_email,project_kind,status,selected_plan_code,expected_camera_count,sales_operator_id,updated_at",
    )
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (!access.isManager && access.operator) {
    projectQuery = projectQuery.eq(
      "sales_operator_id",
      access.operator.id,
    );
  }

  const { data, error } = await projectQuery;
  if (error) {
    throw new Error(`vip_commercial_projects_unavailable:${error.message}`);
  }

  const projects = (data ?? []) as ProjectRow[];
  const projectIds = projects.map((item) => item.id);

  const [proposalResult, contractResult, trialResult] = await Promise.all([
    projectIds.length
      ? admin
          .from("vip_proposals")
          .select("project_id,status,version,presented_at")
          .in("project_id", projectIds)
          .in("status", ["presented", "accepted"])
          .order("version", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? admin
          .from("vip_contracts")
          .select("project_id,status,billing_cycle,paid_at,created_at")
          .in("project_id", projectIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    projectIds.length
      ? admin
          .from("trial_runs")
          .select("vip_project_id,status,capture_started_at,capture_completed_at")
          .in("vip_project_id", projectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    proposalResult.error ?? contractResult.error ?? trialResult.error;
  if (firstError) {
    throw new Error(`vip_commercial_pipeline_unavailable:${firstError.message}`);
  }

  const proposalByProject = new Map<string, any>();
  for (const row of proposalResult.data ?? []) {
    const id = String(row.project_id);
    if (!proposalByProject.has(id)) proposalByProject.set(id, row);
  }

  const contractByProject = new Map<string, any>();
  for (const row of contractResult.data ?? []) {
    const id = String(row.project_id);
    if (!contractByProject.has(id)) contractByProject.set(id, row);
  }

  const trialByProject = new Map(
    (trialResult.data ?? []).map((row: any) => [
      String(row.vip_project_id),
      row,
    ]),
  );

  const running = projects.filter((item) => item.status === "trial_running").length;
  const closing = projects.filter((item) =>
    ["trial_completed", "proposal", "payment_pending"].includes(item.status),
  ).length;
  const paid = projects.filter((item) => {
    const contract = contractByProject.get(item.id);
    return ["paid_pending_activation", "active"].includes(
      String(contract?.status ?? ""),
    );
  }).length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/admin/customers/trials">
            ← Trials padrão
          </Link>
          <span>COMERCIAL · MONITORIA VIP</span>
          <h1>Projetos de alto valor</h1>
          <p>
            Acompanhe implantação, piloto, proposta e pagamento sem acessar
            credenciais técnicas das câmeras.
          </p>
        </div>
        <div className={styles.identity}>
          <span>{access.isManager ? "Administrador" : "Especialista VIP"}</span>
          <strong>{access.operator?.name ?? access.user.email}</strong>
          {!access.isManager && access.operator ? (
            <small>{access.operator.email}</small>
          ) : null}
        </div>
      </header>

      <section className={styles.content}>
        <section className={styles.metrics}>
          <article><span>PROJETOS</span><strong>{projects.length}</strong><small>na carteira</small></article>
          <article><span>TESTES AO VIVO</span><strong>{running}</strong><small>60 min em andamento</small></article>
          <article><span>FECHAMENTO</span><strong>{closing}</strong><small>resultado/proposta/Pix</small></article>
          <article><span>PAGOS</span><strong>{paid}</strong><small>aguardando ou já ativos</small></article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>FUNIL VIP</span>
              <h2>{access.isManager ? "Todos os projetos" : "Meus projetos"}</h2>
            </div>
            <strong>{projects.length} exibido(s)</strong>
          </div>

          <div className={styles.projectList}>
            {projects.length ? projects.map((project) => {
              const proposal = proposalByProject.get(project.id);
              const contract = contractByProject.get(project.id);
              const trial = trialByProject.get(project.id);

              return (
                <article key={project.id} className={styles.projectRow}>
                  <div className={styles.projectIdentity}>
                    <span>{project.selected_plan_code.toUpperCase()}</span>
                    <strong>{project.company_name}</strong>
                    <small>
                      {project.lead_name} · {project.lead_email}
                    </small>
                  </div>

                  <div className={styles.projectScope}>
                    <strong>{project.expected_camera_count}</strong>
                    <span>câmeras previstas</span>
                    <small>Intensive em todo o contrato</small>
                  </div>

                  <div className={styles.projectStatus}>
                    <strong>{statusLabel(project.status)}</strong>
                    {trial?.capture_started_at ? (
                      <small>
                        Teste: {formatDate(String(trial.capture_started_at))}
                      </small>
                    ) : null}
                    {proposal ? (
                      <small>Proposta v{Number(proposal.version)}</small>
                    ) : null}
                    {contract ? (
                      <small>
                        Contrato: {String(contract.status).replaceAll("_", " ")}
                      </small>
                    ) : null}
                  </div>

                  <div className={styles.projectActions}>
                    <Link href={`/comercial/vip/${project.id}`}>
                      Abrir projeto
                    </Link>
                    <small>Atualizado {formatDate(project.updated_at)}</small>
                  </div>
                </article>
              );
            }) : (
              <div className={styles.empty}>
                <strong>Nenhum Projeto VIP atribuído.</strong>
                <p>
                  Os Projetos VIP criados para este vendedor aparecerão aqui.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
