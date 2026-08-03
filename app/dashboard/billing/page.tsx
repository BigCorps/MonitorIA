import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBrl } from "@/src/billing/pricing";
import { pixStatusLabel } from "@/src/billing/pix";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getBillingDashboardData } from "@/src/lib/billing-payment-data";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { PixPaymentPanel } from "./pix-payment-panel";
import styles from "./billing.module.css";

export const metadata = { title: "Cobranças" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    invoice?: string;
    message?: string;
    error?: string;
  }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default async function BillingPage({
  searchParams,
}: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const query = await searchParams;
  const canManage = ["owner", "admin"].includes(
    organization.role,
  );
  const billing = canManage
    ? await getBillingDashboardData(
        organization.id,
        query.invoice ?? null,
      )
    : {
        invoices: [],
        selectedInvoice: null,
        selectedItems: [],
        selectedPayment: null,
      };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="billing"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              COBRANÇAS · {organization.name.toUpperCase()}
            </span>
            <h1>Faturas e pagamentos</h1>
            <p>
              Gere o Pix, acompanhe a confirmação e consulte os
              ciclos anteriores em um único lugar.
            </p>
          </div>

          <Link
            href="/dashboard/plans"
            className={styles.headerAction}
          >
            Alterar planos
          </Link>
        </header>

        {query.message ? (
          <div className={styles.successNotice}>
            {query.message}
          </div>
        ) : null}
        {query.error ? (
          <div className={styles.errorNotice}>{query.error}</div>
        ) : null}

        {!canManage ? (
          <section className={styles.emptyState}>
            <span>ACESSO ADMINISTRATIVO</span>
            <h2>Cobranças protegidas</h2>
            <p>
              Somente proprietários e administradores podem
              consultar faturas e gerar pagamentos.
            </p>
          </section>
        ) : !billing.selectedInvoice ? (
          <section className={styles.emptyState}>
            <span>PRIMEIRA FATURA</span>
            <h2>Escolha os planos das câmeras</h2>
            <p>
              A fatura será criada com uma cobrança única e o
              desconto progressivo calculado automaticamente.
            </p>
            <Link href="/dashboard/plans">
              Configurar planos
            </Link>
          </section>
        ) : (
          <div className={styles.layout}>
            <div className={styles.mainColumn}>
              <section className={styles.invoiceCard}>
                <div className={styles.invoiceHeading}>
                  <div>
                    <span>FATURA SELECIONADA</span>
                    <h2>
                      {billing.selectedInvoice.invoiceNumber}
                    </h2>
                  </div>
                  <div>
                    <small>
                      {pixStatusLabel(
                        billing.selectedInvoice.status,
                      )}
                    </small>
                    <strong>
                      {formatBrl(
                        billing.selectedInvoice.totalCents,
                      )}
                    </strong>
                  </div>
                </div>

                <div className={styles.invoiceItems}>
                  {billing.selectedItems.map((item) => (
                    <div key={item.id}>
                      <span>
                        <strong>{item.description}</strong>
                        <small>
                          {item.billingPosition
                            ? `${item.billingPosition}ª câmera`
                            : "Item adicional"}
                          {item.discountBasisPoints > 0
                            ? ` · ${item.discountBasisPoints / 100}% de desconto`
                            : ""}
                        </small>
                      </span>
                      <b>{formatBrl(item.totalAmountCents)}</b>
                    </div>
                  ))}
                </div>

                <dl className={styles.invoiceTotals}>
                  <div>
                    <dt>Subtotal</dt>
                    <dd>
                      {formatBrl(
                        billing.selectedInvoice.subtotalCents,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Desconto progressivo</dt>
                    <dd>
                      −{" "}
                      {formatBrl(
                        billing.selectedInvoice.discountCents,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd>
                      {formatBrl(
                        billing.selectedInvoice.totalCents,
                      )}
                    </dd>
                  </div>
                </dl>

                <footer>
                  <span>
                    Ciclo: {formatDate(
                      billing.selectedInvoice.servicePeriodStart,
                    )}{" "}
                    até {formatDate(
                      billing.selectedInvoice.servicePeriodEnd,
                    )}
                  </span>
                  <span>
                    Criada em {formatDate(
                      billing.selectedInvoice.createdAt,
                    )}
                  </span>
                </footer>
              </section>

              <PixPaymentPanel
                invoiceId={billing.selectedInvoice.id}
                invoiceNumber={
                  billing.selectedInvoice.invoiceNumber
                }
                invoiceStatus={billing.selectedInvoice.status}
                totalCents={billing.selectedInvoice.totalCents}
                initialPayment={billing.selectedPayment}
                canManage={canManage}
              />
            </div>

            <aside className={styles.historyCard}>
              <div>
                <span>HISTÓRICO</span>
                <h2>Faturas</h2>
              </div>

              <nav aria-label="Histórico de faturas">
                {billing.invoices.map((invoice) => (
                  <Link
                    href={`/dashboard/billing?invoice=${invoice.id}`}
                    className={
                      invoice.id === billing.selectedInvoice?.id
                        ? styles.historySelected
                        : styles.historyItem
                    }
                    key={invoice.id}
                  >
                    <span>
                      <strong>{invoice.invoiceNumber}</strong>
                      <small>
                        {pixStatusLabel(invoice.status)} ·{" "}
                        {formatDate(invoice.createdAt)}
                      </small>
                    </span>
                    <b>{formatBrl(invoice.totalCents)}</b>
                  </Link>
                ))}
              </nav>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}
