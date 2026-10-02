import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import {
  getSalesTrialResultsById,
  salesTrialEventTypeLabel,
} from "@/src/lib/trial-results";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  getVipBillingSummary,
  getVipContractForProject,
  getVipProposalForProject,
} from "@/src/vip/proposal";
import { getVipPlanCatalog } from "@/src/vip/server";
import {
  presentVipProposalAction,
  reopenVipProposalAction,
} from "./actions";
import styles from "../vip-commercial.module.css";

export const metadata = { title: "Projeto VIP | Comercial MonitorIA" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function VipCommercialProjectPage({
  params,
  searchParams,
}: Props) {
  const access = await requireCommercialAccess();
  const { projectId } = await params;
  const query = await searchParams;
  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from("vip_projects")
    .select(
      "id,organization_id,sales_operator_id,name,company_name,lead_name,lead_email,project_kind,status,selected_plan_code,expected_camera_count,updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) notFound();

  if (
    !access.isManager &&
    String(project.sales_operator_id) !== String(access.operator?.id ?? "")
  ) {
    notFound();
  }

  const { data: trial, error: trialError } = await admin
    .from("trial_runs")
    .select(
      "id,status,capture_started_at,capture_ends_at,capture_completed_at,interactions_used,interaction_limit",
    )
    .eq("vip_project_id", projectId)
    .maybeSingle();

  if (trialError) {
    throw new Error(`vip_commercial_trial_unavailable:${trialError.message}`);
  }

  const [plans, proposal, contract, results] = await Promise.all([
    getVipPlanCatalog(),
    getVipProposalForProject(projectId),
    getVipContractForProject(projectId),
    trial?.id ? getSalesTrialResultsById(String(trial.id)) : null,
  ]);

  const billing = await getVipBillingSummary(contract);
  const selectedPlan =
    plans.find((item) => item.code === String(project.selected_plan_code)) ??
    plans[0] ??
    null;
  const recommendedMonthly = proposal
    ? plans.find((item) => item.code === proposal.recommendedMonthlyPlanCode)
    : null;
  const recommendedAnnual = proposal
    ? plans.find((item) => item.code === proposal.recommendedAnnualPlanCode)
    : null;

  const message = firstValue(query.message);
  const error = firstValue(query.error);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/comercial/vip">← Projetos VIP</Link>
          <span>FECHAMENTO · MONITORIA VIP</span>
          <h1>{String(project.company_name)}</h1>
          <p>
            {String(project.lead_name)} · {String(project.lead_email)}
          </p>
        </div>
        <div className={styles.identity}>
          <span>{access.isManager ? "Administrador" : "Especialista VIP"}</span>
          <strong>{access.operator?.name ?? access.user.email}</strong>
          <small>{String(project.expected_camera_count)} câmeras previstas</small>
        </div>
      </header>

      <section className={styles.content}>
        {message ? <div className={styles.success}>{message}</div> : null}
        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.metrics}>
          <article><span>CÂMERAS NO PILOTO</span><strong>{results?.cameraCount ?? 0}</strong><small>selecionadas</small></article>
          <article><span>ACONTECIMENTOS</span><strong>{results?.eventCount ?? 0}</strong><small>estruturados</small></article>
          <article><span>VÍDEOS</span><strong>{results?.clipCount ?? 0}</strong><small>preservados</small></article>
          <article><span>PESQUISA IA</span><strong>{Number(trial?.interactions_used ?? 0)}</strong><small>perguntas usadas</small></article>
        </section>

        {results?.topEventTypes.length ? (
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>PROVA DE VALOR</span>
                <h2>O que apareceu no piloto</h2>
              </div>
              <strong>
                {results.captureCompletedAt
                  ? `Concluído ${formatDate(results.captureCompletedAt)}`
                  : String(trial?.status ?? "")}
              </strong>
            </div>
            <div className={styles.proofGrid}>
              {results.topEventTypes.map((item) => (
                <div key={item.type}>
                  <strong>{item.count}</strong>
                  <span>{salesTrialEventTypeLabel(item.type)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>PROPOSTA</span>
              <h2>Pacote e quantidade</h2>
            </div>
            <strong>
              Status do projeto: {String(project.status).replaceAll("_", " ")}
            </strong>
          </div>

          {["trial_completed", "proposal"].includes(String(project.status)) ? (
            <>
              <form
                action={presentVipProposalAction}
                className={styles.proposalForm}
              >
                <input type="hidden" name="project_id" value={projectId} />
                <label>
                  <span>Pacote</span>
                  <select
                    name="plan_code"
                    defaultValue={proposal?.planCode ?? selectedPlan?.code}
                  >
                    {plans.map((plan) => (
                      <option key={plan.code} value={plan.code}>
                        {plan.displayName} · {plan.includedCameras} incluídas
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Quantidade prevista</span>
                  <input
                    name="camera_count"
                    type="number"
                    min="10"
                    max="100000"
                    defaultValue={
                      proposal?.cameraCount ??
                      Number(project.expected_camera_count)
                    }
                    required
                  />
                </label>
                <button type="submit">
                  {proposal ? "Atualizar proposta" : "Apresentar proposta"}
                </button>
              </form>
              <p className={styles.helper}>
                Você não digita preços. O servidor usa apenas o catálogo oficial
                VIP e congela os valores na versão apresentada ao cliente.
              </p>
            </>
          ) : (
            <p className={styles.helper}>
              Para alterar pacote ou quantidade após o aceite, reabra a proposta
              abaixo. Pagamentos confirmados não podem ser reabertos.
            </p>
          )}

          {proposal ? (
            <div className={styles.proposalSnapshot}>
              <div>
                <span>VERSÃO</span>
                <strong>v{proposal.version}</strong>
              </div>
              <div>
                <span>PACOTE</span>
                <strong>{proposal.planCode.toUpperCase()}</strong>
              </div>
              <div>
                <span>CÂMERAS</span>
                <strong>{proposal.cameraCount}</strong>
              </div>
              <div>
                <span>MENSAL AGORA</span>
                <strong>{money(proposal.pricing.monthlyPayNowCents)}</strong>
              </div>
              <div>
                <span>ANUAL AGORA</span>
                <strong>{money(proposal.pricing.annualPayNowCents)}</strong>
              </div>
            </div>
          ) : null}

          {proposal &&
          (proposal.recommendedMonthlyPlanCode !== proposal.planCode ||
            proposal.recommendedAnnualPlanCode !== proposal.planCode) ? (
            <div className={styles.economy}>
              <strong>O cálculo encontrou um pacote mais econômico.</strong>
              <p>
                Mensal:{" "}
                {recommendedMonthly?.displayName ??
                  proposal.recommendedMonthlyPlanCode}
                {" · "}Anual:{" "}
                {recommendedAnnual?.displayName ??
                  proposal.recommendedAnnualPlanCode}.
                A troca nunca é automática; decida antes de apresentar a próxima versão.
              </p>
            </div>
          ) : null}
        </section>

        {contract ? (
          <section className={styles.panel}>
            <div className={styles.panelHeading}>
              <div>
                <span>CONTRATO / PAGAMENTO</span>
                <h2>
                  {contract.planCode.toUpperCase()} ·{" "}
                  {contract.billingCycle === "annual" ? "Anual" : "Mensal"}
                </h2>
              </div>
              <strong>{money(contract.initialInvoiceTotalCents)}</strong>
            </div>

            <div className={styles.contractFacts}>
              <div><span>Status</span><strong>{contract.status.replaceAll("_", " ")}</strong></div>
              <div><span>Incluídas</span><strong>{contract.includedCameras}</strong></div>
              <div><span>Excedentes</span><strong>{contract.excessCameraCount}</strong></div>
              <div><span>Fatura</span><strong>{billing.invoice?.invoiceNumber ?? "—"}</strong></div>
              <div><span>Pix</span><strong>{billing.payment?.status ?? "não gerado"}</strong></div>
              <div><span>Pago em</span><strong>{formatDate(contract.paidAt)}</strong></div>
            </div>

            {contract.status === "awaiting_payment" ? (
              <form action={reopenVipProposalAction}>
                <input type="hidden" name="project_id" value={projectId} />
                <button className={styles.reopenButton} type="submit">
                  Reabrir proposta antes do pagamento
                </button>
              </form>
            ) : null}

            {contract.status === "paid_pending_activation" ? (
              <div className={styles.paidNotice}>
                Pagamento confirmado. A próxima etapa pode liberar o ambiente
                definitivo sem cobrar novamente.
              </div>
            ) : null}
          </section>
        ) : null}

        <section className={styles.securityNote}>
          <strong>Fronteira comercial</strong>
          <p>
            Esta área não consulta senha, RTSP, token de câmera nem segredo do
            Agent. O vendedor acompanha somente estado, resultados consolidados,
            proposta e pagamento.
          </p>
        </section>
      </section>
    </main>
  );
}
