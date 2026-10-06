import Link from "next/link";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { cheapestVipPlanForMonthlyCameraCount } from "@/src/vip/catalog";
import { getVipPlanCatalog } from "@/src/vip/server";
import { vipConfig } from "@/src/vip/config";
import {
  convertVipLeadAction,
  setVipLeadStatusAction,
} from "./actions";
import { VipInviteCopy } from "./invite-copy";
import styles from "./vip-commercial.module.css";

export const metadata = { title: "Comercial VIP | MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

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
  onboarding_last_activity_at: string | null;
  onboarding_attention_code: string | null;
  updated_at: string;
};

type LeadRow = {
  id: string;
  sales_operator_id: string | null;
  lead_name: string;
  lead_email: string;
  company_name: string;
  phone: string | null;
  project_kind: string;
  expected_camera_count: number;
  objective: string | null;
  status: string;
  source: string;
  first_submitted_at: string;
  last_submitted_at: string;
};

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

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

function leadStatusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "Novo interesse",
    contacted: "Contatado",
    qualified: "Qualificado",
  };
  return labels[status] ?? status;
}

function kindLabel(kind: string) {
  const labels: Record<string, string> = {
    enterprise: "Grande empresa",
    large_monitoring: "Central / monitoramento",
    scientific: "Projeto científico",
    other: "Projeto especial",
  };
  return labels[kind] ?? kind;
}

function attentionLabel(code: string | null) {
  if (!code) return null;
  const labels: Record<string, string> = {
    workspace_required: "Vincular empresa ao Projeto",
    install_agent: "Instalar o Agent",
    discover_cameras: "Descobrir câmeras",
    configure_camera_context: "Concluir contexto das câmeras",
    trial_not_linked: "Vincular o piloto",
    select_trial_cameras: "Selecionar câmeras do piloto",
    resolve_camera_readiness: "Resolver prontidão das câmeras",
    ready_to_start: "Piloto pronto para iniciar",
    trial_running: "Piloto em andamento",
    review_trial_results: "Revisar resultado do piloto",
    contract_converted: "Contratação convertida",
    continue_onboarding: "Continuar implantação",
  };
  return labels[code] ?? code.replaceAll("_", " ");
}

function activityAge(value: string | null) {
  if (!value) return null;
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default async function VipCommercialPage({ searchParams }: Props) {
  const access = await requireCommercialAccess();
  const admin = createAdminClient();
  const [query, plans] = await Promise.all([
    searchParams,
    getVipPlanCatalog(),
  ]);

  let projectQuery = admin
    .from("vip_projects")
    .select(
      "id,company_name,lead_name,lead_email,project_kind,status,selected_plan_code,expected_camera_count,sales_operator_id,onboarding_last_activity_at,onboarding_attention_code,updated_at",
    )
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(100);

  let leadQuery = admin
    .from("vip_lead_requests")
    .select(
      "id,sales_operator_id,lead_name,lead_email,company_name,phone,project_kind,expected_camera_count,objective,status,source,first_submitted_at,last_submitted_at",
    )
    .in("status", ["new", "contacted", "qualified"])
    .order("last_submitted_at", { ascending: false })
    .limit(100);

  if (!access.isManager && access.operator) {
    projectQuery = projectQuery.eq(
      "sales_operator_id",
      access.operator.id,
    );
    leadQuery = leadQuery.eq(
      "sales_operator_id",
      access.operator.id,
    );
  }

  const [projectResult, leadResult] = await Promise.all([
    projectQuery,
    leadQuery,
  ]);

  if (projectResult.error) {
    throw new Error(
      `vip_commercial_projects_unavailable:${projectResult.error.message}`,
    );
  }
  if (leadResult.error) {
    throw new Error(
      `vip_commercial_leads_unavailable:${leadResult.error.message}`,
    );
  }

  const projects = (projectResult.data ?? []) as ProjectRow[];
  const leads = (leadResult.data ?? []) as LeadRow[];
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
    throw new Error(
      `vip_commercial_pipeline_unavailable:${firstError.message}`,
    );
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

  const running = projects.filter(
    (item) => item.status === "trial_running",
  ).length;
  const closing = projects.filter((item) =>
    ["trial_completed", "proposal", "payment_pending"].includes(item.status),
  ).length;
  const paid = projects.filter((item) => {
    const contract = contractByProject.get(item.id);
    return ["paid_pending_activation", "active"].includes(
      String(contract?.status ?? ""),
    );
  }).length;

  const token = first(query.token);
  const company = first(query.company);
  const message = first(query.message);
  const error = first(query.error);
  const inviteUrl = token
    ? `${vipConfig.url}/lead/${encodeURIComponent(token)}`
    : null;

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
            Da entrada pela landing ao pagamento, cada oportunidade permanece
            com o especialista responsável.
          </p>
        </div>
        <div className={styles.identity}>
          <span>
            {access.isManager ? "Administrador" : "Especialista VIP"}
          </span>
          <strong>{access.operator?.name ?? access.user.email}</strong>
          {!access.isManager && access.operator ? (
            <small>{access.operator.email}</small>
          ) : null}
        </div>
      </header>

      <section className={styles.content}>
        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        {inviteUrl ? (
          <section className={styles.inviteReady}>
            <div>
              <span>CONVITE VIP PRONTO</span>
              <h2>{company || "Projeto MonitorIA VIP"}</h2>
              <p>
                Este link é individual e expira em 7 dias. Envie ao cliente
                somente depois de combinar a implantação.
              </p>
            </div>
            <div className={styles.inviteLink}>
              <input value={inviteUrl} readOnly />
              <VipInviteCopy url={inviteUrl} />
              <a href={inviteUrl} target="_blank" rel="noreferrer">
                Abrir convite
              </a>
            </div>
          </section>
        ) : null}

        <section className={styles.metrics}>
          <article>
            <span>NOVOS INTERESSES</span>
            <strong>{leads.length}</strong>
            <small>aguardando condução comercial</small>
          </article>
          <article>
            <span>PROJETOS</span>
            <strong>{projects.length}</strong>
            <small>na carteira</small>
          </article>
          <article>
            <span>TESTES AO VIVO</span>
            <strong>{running}</strong>
            <small>60 min em andamento</small>
          </article>
          <article>
            <span>FECHAMENTO</span>
            <strong>{closing}</strong>
            <small>resultado/proposta/Pix</small>
          </article>
          <article>
            <span>PAGOS</span>
            <strong>{paid}</strong>
            <small>aguardando ou já ativos</small>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>ENTRADAS DA LANDING VIP</span>
              <h2>
                {access.isManager
                  ? "Interesses em avaliação"
                  : "Meus novos interesses"}
              </h2>
            </div>
            <strong>{leads.length} aberto(s)</strong>
          </div>

          {leads.length ? (
            <div className={styles.leadList}>
              {leads.map((lead) => {
                const recommended =
                  cheapestVipPlanForMonthlyCameraCount(
                    plans,
                    Number(lead.expected_camera_count),
                  ) ?? plans[0];

                return (
                  <article className={styles.leadCard} key={lead.id}>
                    <div className={styles.leadMain}>
                      <div className={styles.leadTitle}>
                        <div>
                          <span>{leadStatusLabel(lead.status)}</span>
                          <h3>{lead.company_name}</h3>
                          <p>
                            {lead.lead_name} · {lead.lead_email}
                            {lead.phone ? ` · ${lead.phone}` : ""}
                          </p>
                        </div>
                        <b>{lead.expected_camera_count} câmeras</b>
                      </div>

                      <div className={styles.leadMeta}>
                        <span>{kindLabel(lead.project_kind)}</span>
                        <span>
                          Recebido {formatDate(lead.first_submitted_at)}
                        </span>
                        {lead.last_submitted_at !== lead.first_submitted_at ? (
                          <span>
                            Atualizado {formatDate(lead.last_submitted_at)}
                          </span>
                        ) : null}
                      </div>

                      {lead.objective ? (
                        <blockquote>{lead.objective}</blockquote>
                      ) : null}
                    </div>

                    <form
                      action={convertVipLeadAction}
                      className={styles.convertForm}
                    >
                      <input
                        type="hidden"
                        name="lead_request_id"
                        value={lead.id}
                      />
                      <label>
                        <span>Pacote inicial</span>
                        <select
                          name="plan_code"
                          defaultValue={recommended?.code ?? "vip10"}
                        >
                          {plans.map((plan) => (
                            <option value={plan.code} key={plan.code}>
                              {plan.displayName} · {plan.includedCameras} incluídas
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Câmeras previstas</span>
                        <input
                          type="number"
                          name="camera_count"
                          min={10}
                          max={100000}
                          defaultValue={lead.expected_camera_count}
                          required
                        />
                      </label>
                      <button type="submit">
                        Criar Projeto + convite
                      </button>
                      <small>
                        Sugestão inicial calculada pelo custo mensal. O vendedor
                        continua decidindo o pacote antes de criar o Projeto.
                      </small>
                    </form>

                    <div className={styles.leadActions}>
                      {lead.status !== "contacted" ? (
                        <form action={setVipLeadStatusAction}>
                          <input
                            type="hidden"
                            name="lead_request_id"
                            value={lead.id}
                          />
                          <input
                            type="hidden"
                            name="status"
                            value="contacted"
                          />
                          <button type="submit">Marcar como contatado</button>
                        </form>
                      ) : null}
                      <form action={setVipLeadStatusAction}>
                        <input
                          type="hidden"
                          name="lead_request_id"
                          value={lead.id}
                        />
                        <input
                          type="hidden"
                          name="status"
                          value="disqualified"
                        />
                        <button
                          className={styles.archiveButton}
                          type="submit"
                        >
                          Arquivar
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.empty}>
              <strong>Nenhum interesse aberto agora.</strong>
              <p>
                Novos formulários enviados em vip.monitoria.cam aparecerão aqui,
                já atribuídos ao especialista ativo.
              </p>
            </div>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>FUNIL VIP</span>
              <h2>
                {access.isManager ? "Todos os projetos" : "Meus projetos"}
              </h2>
            </div>
            <strong>{projects.length} exibido(s)</strong>
          </div>

          <div className={styles.projectList}>
            {projects.length ? (
              projects.map((project) => {
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
                      {project.onboarding_attention_code &&
                      !["proposal", "payment_pending", "active"].includes(
                        project.status,
                      ) ? (
                        <small className={styles.attention}>
                          Próxima ação:{" "}
                          {attentionLabel(project.onboarding_attention_code)}
                        </small>
                      ) : null}
                      {project.onboarding_last_activity_at ? (
                        <small>
                          Última atividade há{" "}
                          {activityAge(project.onboarding_last_activity_at)}
                        </small>
                      ) : null}
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
                          Contrato:{" "}
                          {String(contract.status).replaceAll("_", " ")}
                        </small>
                      ) : null}
                    </div>

                    <div className={styles.projectActions}>
                      <Link href={`/comercial/vip/${project.id}/acompanhar`}>
                        Acompanhar ao vivo
                      </Link>
                      <Link href={`/comercial/vip/${project.id}`}>
                        Abrir projeto
                      </Link>
                      <small>
                        Atualizado {formatDate(project.updated_at)}
                      </small>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className={styles.empty}>
                <strong>Nenhum Projeto VIP atribuído.</strong>
                <p>
                  Converta um interesse acima ou crie um Projeto VIP pelo fluxo
                  comercial.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
