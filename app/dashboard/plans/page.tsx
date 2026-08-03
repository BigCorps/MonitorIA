import { redirect } from "next/navigation";
import { formatBrl } from "@/src/billing/pricing";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCommercialFoundationData } from "@/src/lib/billing-data";
import {
  getCurrentOrganization,
  getOrganizationCameras,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { PlanSelector } from "./plan-selector";
import styles from "./plans.module.css";

export const metadata = { title: "Planos" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default async function PlansPage({
  searchParams,
}: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [cameras, commercial, query] = await Promise.all([
    getOrganizationCameras(organization.id),
    getCommercialFoundationData(organization.id),
    searchParams,
  ]);

  const canManage =
    organization.role === "owner" ||
    organization.role === "admin";

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="plans"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PLANOS · {organization.name.toUpperCase()}
            </span>
            <h1>Inteligência sob medida para cada câmera</h1>
            <p>
              Combine planos diferentes, mantenha 365 dias de
              histórico e receba uma única cobrança por Pix.
            </p>
          </div>

          <div className={styles.headerFacts}>
            <span>Sem mensalidade fixa</span>
            <strong>90 interações de IA/mês</strong>
          </div>
        </header>

        {query.message ? (
          <div className={styles.successNotice}>
            {query.message}
          </div>
        ) : null}

        {query.error ? (
          <div className={styles.errorNotice}>
            {query.error}
          </div>
        ) : null}

        <PlanSelector
          cameras={cameras}
          plans={commercial.plans}
          tiers={commercial.tiers}
          subscriptions={commercial.subscriptions}
          canManage={canManage}
        />

        {commercial.draftInvoice ? (
          <section className={styles.invoiceCard}>
            <div className={styles.sectionHeading}>
              <div>
                <span>FATURA EM RASCUNHO</span>
                <h2>
                  {commercial.draftInvoice.invoiceNumber}
                </h2>
              </div>
              <strong>
                {formatBrl(
                  commercial.draftInvoice.totalCents,
                )}
              </strong>
            </div>

            <div className={styles.invoiceItems}>
              {commercial.draftInvoice.items.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.billingPosition
                      ? `${item.billingPosition}ª · `
                      : ""}
                    {item.description}
                  </span>
                  <strong>
                    {formatBrl(item.totalAmountCents)}
                  </strong>
                </div>
              ))}
            </div>

            <footer>
              <span>
                Período preparado:{" "}
                {formatDate(
                  commercial.draftInvoice.servicePeriodStart,
                )}{" "}
                até{" "}
                {formatDate(
                  commercial.draftInvoice.servicePeriodEnd,
                )}
              </span>
              <span>
                Desconto total:{" "}
                {formatBrl(
                  commercial.draftInvoice.discountCents,
                )}
              </span>
            </footer>

            <p>
              Esta fatura já está registrada com os preços e
              descontos congelados. A geração do QR Code Pix será
              adicionada na Fase 2.
            </p>
          </section>
        ) : null}

        <section className={styles.foundationStrip}>
          <div>
            <span>HISTÓRICO</span>
            <strong>365 dias em todos os planos</strong>
          </div>
          <div>
            <span>DESCONTO</span>
            <strong>Até 20% nas câmeras adicionais</strong>
          </div>
          <div>
            <span>TOLERÂNCIA</span>
            <strong>
              {commercial.billingAccount?.gracePeriodDays ?? 3}{" "}
              dias após o vencimento
            </strong>
          </div>
          <div>
            <span>ASSISTENTE</span>
            <strong>
              {commercial.allowance
                ? `${commercial.allowance.remainingInteractions} disponíveis`
                : "90 por ciclo após a ativação"}
            </strong>
          </div>
        </section>
      </section>
    </main>
  );
}
