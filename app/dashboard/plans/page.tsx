import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formatBrl } from "@/src/billing/pricing";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCommercialFoundationData } from "@/src/lib/billing-data";
import {
  getCurrentOrganization,
  getOrganizationCameras,
} from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { DashboardSidebar } from "../dashboard-sidebar";
import { PlanSelector } from "./plan-selector";
import styles from "./plans.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Planos" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
    trial?: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

async function trialCameraIdsForOrganization(input: {
  organizationId: string;
  trialId: string | undefined;
}) {
  if (
    !input.trialId ||
    !z.string().uuid().safeParse(input.trialId).success
  ) {
    return [];
  }

  const supabase = await createClient();

  const { data: trial, error: trialError } =
    await supabase
      .from("trial_runs")
      .select("id")
      .eq("id", input.trialId)
      .eq("organization_id", input.organizationId)
      .eq("trial_mode", "sales_assisted")
      .maybeSingle();

  if (trialError || !trial) return [];

  const { data: participants, error } =
    await supabase
      .from("trial_run_cameras")
      .select("camera_id")
      .eq("trial_run_id", input.trialId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

  if (error) return [];

  return (participants ?? []).map((row) =>
    String(row.camera_id),
  );
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

  const trialCameraIds =
    await trialCameraIdsForOrganization({
      organizationId: organization.id,
      trialId: query.trial,
    });

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

        <DashboardSectionTabs group="settings" />

        {trialCameraIds.length ? (
          <div className={styles.successNotice}>
            Demonstração carregada: selecionamos automaticamente
            as câmeras testadas no plano Detalhada. Revise antes
            de preparar a cobrança.
          </div>
        ) : null}

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
          trialCameraIds={trialCameraIds}
        />

        {commercial.draftInvoice ? (
          <section className={styles.invoiceCard}>
            <div className={styles.sectionHeading}>
              <div>
                <span>FATURA ATUAL</span>
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

            <div className={styles.invoiceAction}>
              <p>
                Esta fatura já está registrada com os preços e
                descontos congelados. Continue para gerar o QR Code
                Pix e acompanhar a confirmação automática.
              </p>
              <Link
                href={`/dashboard/billing?invoice=${commercial.draftInvoice.id}`}
              >
                Ir para pagamento
              </Link>
            </div>
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
