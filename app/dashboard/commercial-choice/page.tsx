import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "./commercial-choice.module.css";

export const metadata = { title: "Como deseja começar" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ message?: string }>;
};

const TRIAL_ALREADY_USED_STATUSES = new Set([
  "running",
  "capture_completed",
  "exploration",
  "converted",
  "expired",
  "purged",
]);

export default async function CommercialChoicePage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = createAdminClient();
  const [cameraResult, entitlementResult, trialResult, query] = await Promise.all([
    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id),
    supabase
      .from("camera_entitlements")
      .select("camera_id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("monitoring_allowed", true),
    supabase
      .from("trial_runs")
      .select("status,capture_ends_at")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    searchParams,
  ]);

  if ((cameraResult.count ?? 0) === 0) redirect("/dashboard/cameras/discovery");
  if ((entitlementResult.count ?? 0) > 0) redirect("/dashboard");

  const trial = trialResult.data as {
    status?: string;
    capture_ends_at?: string | null;
  } | null;
  const trialStatus = String(trial?.status ?? "");

  // Esta rota só oferece o trial antes do primeiro uso.
  // Depois que o relógio já começou uma vez, o cliente não vê novamente
  // qualquer card ou CTA sugerindo um novo período gratuito.
  if (TRIAL_ALREADY_USED_STATUSES.has(trialStatus)) {
    if (["capture_completed", "exploration"].includes(trialStatus)) {
      redirect("/dashboard/trial");
    }

    redirect("/dashboard/plans");
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="plans"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">PRIMEIRO ACESSO · PASSO 4</span>
            <h1>Como deseja começar?</h1>
            <p>
              O MonitorIA ainda não está fazendo análises. Escolha uma das duas
              opções abaixo para liberar o monitoramento.
            </p>
          </div>
        </header>

        {query.message ? <div className={styles.message}>{query.message}</div> : null}

        {trial && ["draft", "ready"].includes(String(trial.status)) ? (
          <div className={styles.pendingBox}>
            <strong>Seu teste gratuito ainda não começou.</strong>
            <span>
              A câmera/modo já foi selecionado, mas o relógio de 24 horas só
              começa quando você confirmar o início na próxima tela.
            </span>
            <Link href="/dashboard/trial">Continuar preparação do teste</Link>
          </div>
        ) : null}

        <div className={styles.options}>
          <article className={styles.card}>
            <span className={styles.kicker}>TESTE GRATUITO</span>
            <h2>Experimentar por 24 horas</h2>
            <p>
              Escolha uma câmera e qualquer modo de análise. Não pedimos cartão.
              O relógio só começa quando você apertar “Iniciar minhas 24 horas grátis”.
            </p>
            <ul>
              <li>24 horas reais de monitoramento</li>
              <li>7 dias para explorar os acontecimentos</li>
              <li>21 interações com a Pesquisa IA</li>
            </ul>
            <Link className={styles.primary} href="/dashboard/trial">
              Testar grátis por 24 horas
            </Link>
          </article>

          <article className={styles.card}>
            <span className={styles.kicker}>CONTRATAR AGORA</span>
            <h2>Escolher os planos das câmeras</h2>
            <p>
              Defina o modo de cada câmera, veja o valor antes de confirmar e
              gere a cobrança por Pix. O monitoramento é liberado após a confirmação.
            </p>
            <ul>
              <li>Plano individual por câmera</li>
              <li>Preço exibido antes da cobrança</li>
              <li>Ativação automática após pagamento</li>
            </ul>
            <Link className={styles.secondary} href="/dashboard/plans">
              Ver planos e contratar
            </Link>
          </article>
        </div>

        <div className={styles.safety}>
          <strong>Sem cobrança ou teste escondido.</strong>
          <span>
            Enquanto nenhuma das opções acima for concluída, as câmeras podem
            permanecer conectadas, mas o servidor não autoriza o monitoramento.
          </span>
        </div>
      </section>
    </main>
  );
}
