import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBrl } from "@/src/billing/pricing";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  getSalesTrialResultsForOrganization,
  salesTrialEventTypeLabel,
} from "@/src/lib/trial-results";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { VipLiveRefresh } from "@/src/components/vip-live-refresh";
import { getVipTrialLiveSnapshotByProject } from "@/src/vip/live";
import {
  getVipBillingSummary,
  getVipContractForProject,
  getVipProposalForProject,
} from "@/src/vip/proposal";
import { getVipPlanCatalog, getVipProjectForOrganization } from "@/src/vip/server";
import { VipAssistantPanel } from "@/app/vip/onboarding/vip-assistant-panel";
import { acceptVipProposalAction } from "./actions";
import { VipPaymentPanel } from "./vip-payment-panel";
import styles from "./vip-closing.module.css";

export const metadata = { title: "Resultado e contratação VIP" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function projectKindLabel(value: string) {
  const labels: Record<string, string> = {
    enterprise: "Grande empresa",
    large_monitoring: "Operação de monitoramento",
    scientific: "Projeto científico",
    other: "Projeto especial",
  };
  return labels[value] ?? "Projeto VIP";
}

export default async function VipClosingPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const project = await getVipProjectForOrganization(organization.id);
  if (!project) redirect("/dashboard");

  if (
    ["lead", "invited", "project_setup", "installing", "calibrating",
      "ready_for_trial", "trial_running"].includes(project.status)
  ) {
    redirect("/vip/onboarding");
  }

  if (project.status === "active") redirect("/vip/dashboard");
  if (project.status === "cancelled") redirect("/dashboard");

  const [proposal, contract, results, live, plans, query] = await Promise.all([
    getVipProposalForProject(project.id),
    getVipContractForProject(project.id),
    getSalesTrialResultsForOrganization(organization.id),
    getVipTrialLiveSnapshotByProject(project.id),
    getVipPlanCatalog(),
    searchParams,
  ]);

  const billing = await getVipBillingSummary(contract);
  const admin = createAdminClient();

  if (
    contract?.status === "paid_pending_activation" &&
    billing.invoice?.status === "paid"
  ) {
    const { data: activation, error: activationError } = await admin.rpc(
      "activate_paid_vip_contract_v1",
      {
        p_contract_id: contract.id,
        p_actor_user_id: user.id,
      },
    );

    const activationRow =
      activation && typeof activation === "object" && !Array.isArray(activation)
        ? (activation as Record<string, unknown>)
        : {};

    if (!activationError && activationRow.success === true) {
      redirect("/vip/dashboard?message=Ambiente+VIP+ativado");
    }
  }
  const { data: seller } = await admin
    .from("sales_operators")
    .select("name,email")
    .eq("id", project.salesOperatorId)
    .maybeSingle();

  const canManage = ["owner", "admin"].includes(organization.role);
  const selectedPlan = proposal
    ? plans.find((item) => item.code === proposal.planCode) ?? null
    : plans.find((item) => item.code === project.selectedPlanCode) ?? null;
  const monthlyRecommended = proposal
    ? plans.find(
        (item) => item.code === proposal.recommendedMonthlyPlanCode,
      ) ?? null
    : null;
  const annualRecommended = proposal
    ? plans.find(
        (item) => item.code === proposal.recommendedAnnualPlanCode,
      ) ?? null
    : null;

  const message = firstValue(query.message);
  const error = firstValue(query.error);
  const assistantRemaining = live?.assistantRemaining ?? 0;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/vip/closing" className={styles.brand}>
          Monitor<span>IA</span><b>VIP</b>
        </Link>
        <div>
          <span>{organization.name}</span>
          <strong>{selectedPlan?.displayName ?? "MonitorIA VIP"}</strong>
        </div>
      </header>

      <section className={styles.shell}>
        <aside className={styles.aside}>
          <span className={styles.eyebrow}>FECHAMENTO ASSISTIDO</span>
          <h1>{project.name}</h1>
          <p>
            {projectKindLabel(project.projectKind)} ·{" "}
            {proposal?.cameraCount ?? project.expectedCameraCount} câmeras
          </p>

          <div className={styles.sellerCard}>
            <span>SEU ESPECIALISTA</span>
            <strong>
              {seller?.name ? String(seller.name) : "Equipe MonitorIA VIP"}
            </strong>
            {seller?.email ? (
              <a href={`mailto:${String(seller.email)}`}>
                {String(seller.email)}
              </a>
            ) : null}
            <p>
              O especialista pode ajustar o pacote antes do aceite. O cliente
              escolhe apenas a periodicidade da proposta apresentada.
            </p>
          </div>

          <div className={styles.summaryCard}>
            <span>PROGRESSO</span>
            <div><i>✓</i><b>Piloto concluído</b></div>
            <div data-current={project.status === "trial_completed"}>
              <i>8</i><b>Proposta</b>
            </div>
            <div data-current={project.status === "proposal"}>
              <i>8</i><b>Escolha comercial</b>
            </div>
            <div data-current={project.status === "payment_pending"}>
              <i>9</i><b>Pagamento</b>
            </div>
          </div>

          <div className={styles.safetyCard}>
            <strong>Configuração preservada</strong>
            <p>
              O pagamento não recria câmeras nem apaga o piloto. A ativação
              definitiva reaproveita o projeto e o contexto já configurados.
            </p>
          </div>
        </aside>

        <section className={styles.content}>
          {message ? <div className={styles.success}>{message}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          <section className={styles.hero}>
            <div>
              <span>PROVA DE VALOR · DADOS REAIS DO PILOTO</span>
              <h2>O que o MonitorIA conseguiu estruturar em 60 minutos</h2>
              <p>
                Este resumo usa somente o que foi registrado nas câmeras
                selecionadas. Itens marcados para revisão continuam exigindo
                conferência humana.
              </p>
            </div>
            <div className={styles.heroMeta}>
              <small>CAPTURA</small>
              <strong>
                {results?.captureStartedAt
                  ? formatDate(results.captureStartedAt)
                  : "Concluída"}
              </strong>
              <span>
                {results?.captureEndsAt
                  ? `até ${formatDate(results.captureEndsAt)}`
                  : "piloto VIP"}
              </span>
            </div>
          </section>

          <section className={styles.metrics}>
            <article>
              <span>CÂMERAS</span>
              <strong>{results?.cameraCount ?? live?.cameraCount ?? 0}</strong>
              <small>participaram do piloto</small>
            </article>
            <article>
              <span>ACONTECIMENTOS</span>
              <strong>{results?.eventCount ?? live?.eventCount ?? 0}</strong>
              <small>eventos estruturados</small>
            </article>
            <article>
              <span>VÍDEOS</span>
              <strong>{results?.clipCount ?? 0}</strong>
              <small>evidências preservadas</small>
            </article>
            <article>
              <span>CONTINUIDADES</span>
              <strong>{results?.continuationCount ?? 0}</strong>
              <small>sequências reconhecidas</small>
            </article>
            <article>
              <span>REVISÃO</span>
              <strong>{results?.reviewCount ?? 0}</strong>
              <small>itens para conferência</small>
            </article>
          </section>

          {results?.topEventTypes.length ? (
            <section className={styles.proofPanel}>
              <div className={styles.panelHeading}>
                <span>DESTAQUES DO PILOTO</span>
                <h3>Tipos de acontecimentos mais frequentes</h3>
              </div>
              <div className={styles.typeGrid}>
                {results.topEventTypes.map((item) => (
                  <div key={item.type}>
                    <strong>{item.count}</strong>
                    <span>{salesTrialEventTypeLabel(item.type)}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {assistantRemaining > 0 ? (
            <section className={styles.assistantWrap}>
              <div className={styles.sectionIntro}>
                <span>PESQUISA IA</span>
                <h3>Ainda dá para explorar o que foi capturado</h3>
                <p>
                  Enquanto o período de exploração estiver ativo, as perguntas
                  continuam consultando apenas os dados já registrados no piloto.
                </p>
              </div>
              <VipAssistantPanel
                initialRemaining={assistantRemaining}
                trialFinished
              />
            </section>
          ) : null}

          {project.status === "trial_completed" && !proposal ? (
            <section className={styles.waitingProposal}>
              <VipLiveRefresh intervalMs={15_000} />
              <span>PROPOSTA EM PREPARAÇÃO</span>
              <h2>Seu especialista está transformando o piloto em uma proposta.</h2>
              <p>
                Os preços não são inventados pelo vendedor: ele escolhe um dos
                pacotes oficiais e a quantidade prevista de câmeras. O servidor
                calcula os excedentes e congela o snapshot que aparecerá aqui.
              </p>
              {seller?.email ? (
                <a href={`mailto:${String(seller.email)}`}>
                  Falar com o especialista
                </a>
              ) : null}
            </section>
          ) : null}

          {project.status === "proposal" && proposal ? (
            <section className={styles.proposalPanel}>
              <div className={styles.proposalHeader}>
                <div>
                  <span>PROPOSTA VIP · VERSÃO {proposal.version}</span>
                  <h2>{selectedPlan?.displayName ?? proposal.planCode}</h2>
                  <p>
                    {proposal.cameraCount} câmeras previstas ·{" "}
                    {proposal.pricing.includedCameras} incluídas no pacote
                    {proposal.pricing.excessCameraCount > 0
                      ? ` · ${proposal.pricing.excessCameraCount} excedente(s)`
                      : ""}
                  </p>
                </div>
                <div>
                  <small>VALOR POR EXCEDENTE</small>
                  <strong>
                    {formatBrl(proposal.pricing.excessCameraMonthlyCents)}/mês
                  </strong>
                </div>
              </div>

              {(proposal.recommendedMonthlyPlanCode !== proposal.planCode ||
                proposal.recommendedAnnualPlanCode !== proposal.planCode) ? (
                <div className={styles.economyNotice}>
                  <strong>O sistema encontrou uma possível economia.</strong>
                  <p>
                    {proposal.recommendedMonthlyPlanCode !== proposal.planCode
                      ? `No mensal, ${monthlyRecommended?.displayName ?? proposal.recommendedMonthlyPlanCode} é o pacote de menor custo para ${proposal.cameraCount} câmeras. `
                      : ""}
                    {proposal.recommendedAnnualPlanCode !== proposal.planCode
                      ? `No anual, ${annualRecommended?.displayName ?? proposal.recommendedAnnualPlanCode} é o pacote de menor custo estimado para ${proposal.cameraCount} câmeras.`
                      : ""}
                  </p>
                  <small>
                    Nada é trocado automaticamente. Peça ao especialista para
                    atualizar a proposta antes de aceitar, se desejar.
                  </small>
                </div>
              ) : null}

              <div className={styles.offerGrid}>
                <article className={styles.offer}>
                  <span>MENSAL</span>
                  <strong>{formatBrl(proposal.pricing.monthlyPayNowCents)}</strong>
                  <small>por mês com a quantidade atual</small>
                  <dl>
                    <div>
                      <dt>Pacote</dt>
                      <dd>{formatBrl(proposal.pricing.monthlyBaseCents)}</dd>
                    </div>
                    <div>
                      <dt>Excedentes</dt>
                      <dd>{formatBrl(proposal.pricing.monthlyExcessCents)}</dd>
                    </div>
                    <div>
                      <dt>Estimativa em 12 meses</dt>
                      <dd>
                        {formatBrl(
                          proposal.pricing.monthlyEstimatedFirstYearCents,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <form action={acceptVipProposalAction}>
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="billing_cycle" value="monthly" />
                    <button type="submit" disabled={!canManage}>
                      Escolher mensal
                    </button>
                  </form>
                </article>

                <article className={`${styles.offer} ${styles.annualOffer}`}>
                  <span>ANUAL · BASE PRÉ-PAGA</span>
                  <strong>{formatBrl(proposal.pricing.annualPayNowCents)}</strong>
                  <small>agora: base anual + 1º mês dos excedentes</small>
                  <dl>
                    <div>
                      <dt>Base anual</dt>
                      <dd>{formatBrl(proposal.pricing.annualBaseCents)}</dd>
                    </div>
                    <div>
                      <dt>Excedentes no pagamento inicial</dt>
                      <dd>{formatBrl(proposal.pricing.monthlyExcessCents)}</dd>
                    </div>
                    <div>
                      <dt>1º ano estimado*</dt>
                      <dd>
                        {formatBrl(
                          proposal.pricing.annualEstimatedFirstYearCents,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    *Os excedentes continuam mensais e acompanham a quantidade
                    ativa. A estimativa considera a quantidade atual por 12 meses.
                  </p>
                  <form action={acceptVipProposalAction}>
                    <input type="hidden" name="proposal_id" value={proposal.id} />
                    <input type="hidden" name="billing_cycle" value="annual" />
                    <button type="submit" disabled={!canManage}>
                      Escolher anual
                    </button>
                  </form>
                </article>
              </div>

              {!canManage ? (
                <p className={styles.permissionNote}>
                  Entre como proprietário ou administrador da empresa para aceitar
                  a proposta.
                </p>
              ) : null}
            </section>
          ) : null}

          {project.status === "payment_pending" && contract ? (
            <section className={styles.contractPanel}>
              <div className={styles.contractHeader}>
                <div>
                  <span>CONTRATO ACEITO</span>
                  <h2>
                    {selectedPlan?.displayName ?? contract.planCode} ·{" "}
                    {contract.billingCycle === "annual" ? "Anual" : "Mensal"}
                  </h2>
                  <p>
                    {contract.contractedCameraCount} câmeras previstas ·{" "}
                    {contract.includedCameras} incluídas ·{" "}
                    {contract.excessCameraCount} excedente(s)
                  </p>
                </div>
                <strong>{formatBrl(contract.initialInvoiceTotalCents)}</strong>
              </div>

              {contract.billingCycle === "annual" &&
              contract.excessCameraCount > 0 ? (
                <div className={styles.excessNote}>
                  A base anual é pré-paga. Os {contract.excessCameraCount} excedentes
                  atuais custam{" "}
                  <strong>
                    {formatBrl(
                      contract.excessCameraCount *
                        contract.excessCameraMonthlyCents,
                    )}/mês
                  </strong>{" "}
                  e serão recalculados mensalmente conforme a quantidade ativa.
                </div>
              ) : null}

              {contract.status === "paid_pending_activation" ||
              billing.invoice?.status === "paid" ? (
                <div className={styles.activationPending}>
                  <div>✓</div>
                  <span>PAGAMENTO CONFIRMADO</span>
                  <h3>Seu ambiente VIP está pronto para a etapa de ativação.</h3>
                  <p>
                    A contratação está paga. O próximo passo libera os
                    entitlements VIP e o dashboard definitivo sem refazer a
                    configuração do piloto.
                  </p>
                </div>
              ) : billing.invoice ? (
                <VipPaymentPanel
                  invoiceId={billing.invoice.id}
                  invoiceNumber={billing.invoice.invoiceNumber}
                  invoiceStatus={billing.invoice.status}
                  totalCents={billing.invoice.totalCents}
                  initialPayment={billing.payment}
                  canManage={canManage}
                />
              ) : (
                <div className={styles.error}>
                  A proposta foi aceita, mas a fatura ainda não pôde ser carregada.
                </div>
              )}
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
}
