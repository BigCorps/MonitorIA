import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getAssistantCreditsWorkspace } from "@/src/lib/assistant-commercial-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { createAssistantCreditInvoiceAction } from "./actions";
import styles from "./assistant-credits.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Interações do Assistente" };
export const dynamic = "force-dynamic";

function money(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function date(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  if (status === "active") return "Ativo";
  if (status === "consumed") return "Consumido";
  if (status === "expired") return "Expirado";
  if (status === "cancelled") return "Cancelado";
  if (status === "paid") return "Pago";
  if (status === "pending_payment") return "Aguardando pagamento";
  if (status === "draft") return "Rascunho";
  return status;
}

export default async function AssistantCreditsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const workspace = await getAssistantCreditsWorkspace(organization.id);
  const canManage = new Set(["owner", "admin"]).has(organization.role);
  const balance = workspace.balance;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="search"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">ASSISTENTE · FRANQUIA</span>
            <h1>Interações do Assistente</h1>
            <p>
              A franquia mensal é usada primeiro. Pacotes extras só são
              consumidos depois e permanecem válidos por 12 meses.
            </p>
          </div>
          <Link href="/dashboard/search" className="panel-secondary-action">
            Voltar à pesquisa
          </Link>
        </header>

        <DashboardSectionTabs group="settings" />


        <section className={styles.balanceGrid}>
          <article className={styles.balanceMain}>
            <span>SALDO TOTAL</span>
            <strong>
              {balance.unlimited
                ? "Acesso de homologação"
                : (balance.totalRemaining ?? 0).toLocaleString("pt-BR")}
            </strong>
            <small>
              {balance.unlimited
                ? "Sem débito enquanto o controle comercial legado estiver desativado."
                : "interações disponíveis agora"}
            </small>
          </article>
          <article>
            <span>Franquia incluída</span>
            <strong>{balance.includedRemaining.toLocaleString("pt-BR")}</strong>
            <small>
              {balance.nextResetAt
                ? `renova em ${date(balance.nextResetAt)}`
                : "sem ciclo ativo"}
            </small>
          </article>
          <article>
            <span>Pacotes extras</span>
            <strong>{balance.purchasedRemaining.toLocaleString("pt-BR")}</strong>
            <small>
              {balance.nextPurchasedExpiryAt
                ? `próximo vencimento em ${date(balance.nextPurchasedExpiryAt)}`
                : "nenhum pacote ativo"}
            </small>
          </article>
        </section>

        {balance.blockReason === "subscription_or_trial_required" ? (
          <section className={styles.accessWarning}>
            <div>
              <strong>O Assistente está pausado</strong>
              <p>
                Uma assinatura ativa ou um trial válido é necessário. Pacotes
                extras já adquiridos continuam no saldo até o vencimento.
              </p>
            </div>
            <Link href="/dashboard/plans">Ver planos</Link>
          </section>
        ) : null}

        <section className={styles.explanation}>
          <strong>O que consome uma interação?</strong>
          <p>
            Somente uma resposta livre concluída pelo Assistente. Abrir eventos,
            usar filtros, exportar dados, consultar gráficos prontos ou navegar
            pelo histórico não consome saldo. Perguntas que falham também não
            são cobradas.
          </p>
        </section>

        <section className={styles.section}>
          <div className={styles.heading}>
            <div>
              <span>PACOTES AVULSOS</span>
              <h2>Adicione interações quando precisar</h2>
            </div>
            <small>Pagamento único por Pix · validade de 12 meses</small>
          </div>

          <div className={styles.packageGrid}>
            {workspace.packages.map((item) => (
              <article key={item.code} className={styles.packageCard}>
                <span>{item.interactions.toLocaleString("pt-BR")}</span>
                <h3>interações extras</h3>
                <strong>{money(item.amountCents)}</strong>
                <p>{item.description}</p>
                <small>
                  {money(Math.round(item.amountCents / item.interactions))}
                  {" por interação"}
                </small>
                <form action={createAssistantCreditInvoiceAction}>
                  <input type="hidden" name="packageCode" value={item.code} />
                  <button type="submit" disabled={!canManage}>
                    {canManage ? "Comprar com Pix" : "Acesso administrativo"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        </section>

        {workspace.pendingInvoices.length ? (
          <section className={styles.section}>
            <div className={styles.heading}>
              <div>
                <span>AGUARDANDO PAGAMENTO</span>
                <h2>Compras em andamento</h2>
              </div>
            </div>
            <div className={styles.list}>
              {workspace.pendingInvoices.map((invoice) => (
                <article key={invoice.invoiceId}>
                  <div>
                    <strong>{invoice.displayName}</strong>
                    <small>
                      {invoice.invoiceNumber} · {statusLabel(invoice.status)}
                    </small>
                  </div>
                  <span>{money(invoice.amountCents)}</span>
                  <Link href={`/dashboard/billing?invoice=${invoice.invoiceId}`}>
                    Abrir Pix
                  </Link>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.heading}>
            <div>
              <span>HISTÓRICO</span>
              <h2>Pacotes adquiridos</h2>
            </div>
          </div>

          {workspace.purchases.length ? (
            <div className={styles.list}>
              {workspace.purchases.map((purchase) => (
                <article key={purchase.id}>
                  <div>
                    <strong>{purchase.displayName}</strong>
                    <small>
                      {purchase.invoiceNumber ?? "Fatura"} · ativado em {date(purchase.activatedAt)}
                    </small>
                  </div>
                  <div className={styles.purchaseBalance}>
                    <strong>
                      {purchase.remainingInteractions.toLocaleString("pt-BR")}
                    </strong>
                    <small>
                      de {purchase.purchasedInteractions.toLocaleString("pt-BR")}
                    </small>
                  </div>
                  <div className={styles.purchaseStatus}>
                    <span>{statusLabel(purchase.status)}</span>
                    <small>vence em {date(purchase.validUntil)}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Nenhum pacote extra adquirido.</p>
          )}
        </section>
      </section>
    </main>
  );
}
