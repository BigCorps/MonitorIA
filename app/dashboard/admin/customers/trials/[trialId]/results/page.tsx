import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getSalesTrialResultsById } from "@/src/lib/trial-results";
import { TrialResultsView } from "@/app/dashboard/trial/results/trial-results-view";
import styles from "../../trials.module.css";

export const metadata = { title: "Resultado do trial comercial" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ trialId: string }>;
};

export default async function AdminSalesTrialResultsPage({ params }: Props) {
  const operator = await requireInternalOperator();
  const { trialId } = await params;
  const result = await getSalesTrialResultsById(trialId);

  if (!result) notFound();

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/admin/customers/trials">← Voltar para trials comerciais</Link>
          <span>RESULTADO · BIGCORPS</span>
          <h1>{result.organizationName}</h1>
          <p>Visão interna da demonstração comercial vinculada ao trial.</p>
        </div>
        <div className={styles.operator}>
          <span>Operador</span>
          <strong>{operator.email}</strong>
        </div>
      </header>
      <section className={styles.content}>
        <TrialResultsView result={result} viewer="admin" />
      </section>
    </main>
  );
}
