import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { getSalesTrialResultsById } from "@/src/lib/trial-results";
import { TrialResultsView } from "@/app/dashboard/trial/results/trial-results-view";
import styles from "../../trials.module.css";

export const metadata = { title: "Resultado do trial comercial" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trialId: string }>;
};

export default async function AdminSalesTrialResultsPage({ params }: Props) {
  const access = await requireCommercialAccess();
  const { trialId } = await params;

  if (!access.isManager) {
    const admin = createAdminClient();
    const { data: ownedInvite, error } = await admin
      .from("sales_trial_invites")
      .select("id")
      .eq("trial_run_id", trialId)
      .eq("sales_operator_id", String(access.operator?.id ?? ""))
      .maybeSingle();

    if (error) {
      console.error("Falha ao validar resultado comercial:", error.message);
      notFound();
    }

    if (!ownedInvite) notFound();
  }

  const result = await getSalesTrialResultsById(trialId);

  if (!result) notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/admin/customers/trials">
            ← Voltar para a área comercial
          </Link>
          <span>RESULTADO · BIGCORPS</span>
          <h1>{result.organizationName}</h1>
          <p>Resumo da demonstração comercial vinculada a este lead.</p>
        </div>
        <div className={styles.operator}>
          <span>{access.isManager ? "Administrador" : "Vendedor"}</span>
          <strong>{access.operator?.name ?? access.user.email}</strong>
        </div>
      </header>
      <section className={styles.content}>
        <TrialResultsView result={result} viewer="admin" />
      </section>
    </main>
  );
}
