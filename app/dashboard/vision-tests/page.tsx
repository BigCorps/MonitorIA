import { redirect } from "next/navigation";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { DashboardSidebar } from "../dashboard-sidebar";
import { rateVisionExperimentAction } from "./actions";
import styles from "./vision-tests.module.css";

export const dynamic = "force-dynamic";

function payload(value: unknown) {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  }).format(Number(value ?? 0));
}

function ResultColumn({
  label,
  model,
  value,
  latency,
  cost,
}: {
  label: string;
  model: string;
  value: Record<string, unknown>;
  latency: number;
  cost: number;
}) {
  return (
    <article className={styles.result}>
      <header>
        <div>
          <span>{label}</span>
          <strong>{model}</strong>
        </div>
        <small>
          {(latency / 1000).toFixed(1)}s · {money(cost)}
        </small>
      </header>

      <h3>{String(value.summary ?? "Sem resumo")}</h3>

      <dl>
        <div>
          <dt>Tipo</dt>
          <dd>{String(value.primaryEventType ?? "—")}</dd>
        </div>
        <div>
          <dt>Confiança</dt>
          <dd>
            {Math.round(Number(value.confidence ?? 0) * 100)}%
          </dd>
        </div>
        <div>
          <dt>Revisão</dt>
          <dd>
            {value.requiresReview ? "Necessária" : "Não"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default async function VisionTestsPage() {
  // Tela interna de homologação: expõe modelo, latência e custo em USD.
  // O painel admin já a lista em "IA e custos"; ela nunca esteve na
  // navegação do cliente, mas antes bastava digitar a URL estando logado.
  const user = await requireInternalOperator();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const supabase = await createClient();

  const since = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [experimentsResult, jobsResult, usageResult] =
    await Promise.all([
      supabase
        .from("vision_model_experiments")
        .select(`
          id,
          created_at,
          plan_code,
          nano_model,
          mini_model,
          nano_payload,
          mini_payload,
          nano_latency_ms,
          mini_latency_ms,
          nano_cost_usd,
          mini_cost_usd,
          human_preference,
          camera:cameras(name)
        `)
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("analysis_jobs")
        .select(
          "id,analysis_plan_code,status,latency_ms,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,local_metrics",
        )
        .eq("organization_id", organization.id)
        .gte("created_at", since),
      supabase
        .from("usage_events")
        .select("analysis_plan_code,estimated_cost_usd,metadata")
        .eq("organization_id", organization.id)
        .gte("created_at", since)
        .contains("metadata", { purpose: "continuous_event" }),
    ]);

  if (experimentsResult.error) {
    console.error(
      "Falha ao carregar testes A/B:",
      experimentsResult.error.message,
    );
  }

  const experiments = experimentsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const usage = usageResult.data ?? [];

  const planMetrics = ["basic", "standard", "intensive"].map(
    (planCode) => {
      const planJobs = jobs.filter(
        (job: any) => job.analysis_plan_code === planCode,
      );
      const planUsage = usage.filter(
        (row: any) => row.analysis_plan_code === planCode,
      );
      const completed = planJobs.filter(
        (job: any) => job.status === "completed",
      );
      const maximumDuration = completed.filter(
        (job: any) =>
          job.local_metrics?.closeReason === "maximum_duration",
      ).length;
      const input = completed.reduce(
        (total: number, job: any) =>
          total + Number(job.input_tokens ?? 0),
        0,
      );
      const cached = completed.reduce(
        (total: number, job: any) =>
          total + Number(job.cached_input_tokens ?? 0),
        0,
      );
      const cost = planUsage.reduce(
        (total: number, row: any) =>
          total + Number(row.estimated_cost_usd ?? 0),
        0,
      );
      const latency = completed.reduce(
        (total: number, job: any) =>
          total + Number(job.latency_ms ?? 0),
        0,
      );

      return {
        planCode,
        events: completed.length,
        maximumDurationPercent: completed.length
          ? (maximumDuration / completed.length) * 100
          : 0,
        cachePercent: input ? (cached / input) * 100 : 0,
        averageCostUsd: completed.length
          ? cost / completed.length
          : 0,
        averageLatencyMs: completed.length
          ? latency / completed.length
          : 0,
      };
    },
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="overview"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              VALIDAÇÃO · GPT-5 NANO × MINI
            </span>
            <h1>Comparação de modelos</h1>
            <p>
              Avalie a utilidade do resultado, não apenas a escrita.
              Os mesmos quadros foram analisados pelos dois modelos.
            </p>
          </div>
        </header>

        <div className={styles.notice}>
          O teste só é executado quando
          <code>VISION_AB_TEST_ENABLED=true</code> e para no
          limite configurado por câmera.
        </div>

        <section className={styles.metrics}>
          {planMetrics.map((metric) => (
            <article key={metric.planCode}>
              <span>{metric.planCode}</span>
              <strong>{metric.events} eventos</strong>
              <small>
                máximo: {metric.maximumDurationPercent.toFixed(1)}% ·
                cache: {metric.cachePercent.toFixed(1)}% ·
                média: {money(metric.averageCostUsd)} ·
                {(metric.averageLatencyMs / 1000).toFixed(1)}s
              </small>
            </article>
          ))}
        </section>

        {experiments.length ? (
          <div className={styles.list}>
            {experiments.map((row: any) => {
              const cameraRelation = row.camera;
              const camera = Array.isArray(cameraRelation)
                ? cameraRelation[0]
                : cameraRelation;

              return (
                <section className={styles.card} key={row.id}>
                  <div className={styles.cardHeading}>
                    <div>
                      <span>
                        {String(camera?.name ?? "Câmera")} ·{" "}
                        {String(row.plan_code)}
                      </span>
                      <small>
                        {new Date(
                          String(row.created_at),
                        ).toLocaleString("pt-BR")}
                      </small>
                    </div>

                    <strong>
                      {row.human_preference
                        ? `Avaliado: ${String(
                            row.human_preference,
                          )}`
                        : "Aguardando avaliação"}
                    </strong>
                  </div>

                  <div className={styles.comparison}>
                    <ResultColumn
                      label="ECONÔMICO"
                      model={String(row.nano_model)}
                      value={payload(row.nano_payload)}
                      latency={Number(row.nano_latency_ms)}
                      cost={Number(row.nano_cost_usd)}
                    />

                    <ResultColumn
                      label="REFERÊNCIA"
                      model={String(row.mini_model)}
                      value={payload(row.mini_payload)}
                      latency={Number(row.mini_latency_ms)}
                      cost={Number(row.mini_cost_usd)}
                    />
                  </div>

                  <form
                    action={rateVisionExperimentAction}
                    className={styles.rating}
                  >
                    <input
                      type="hidden"
                      name="experiment_id"
                      value={String(row.id)}
                    />

                    <button name="preference" value="nano">
                      Nano melhor
                    </button>
                    <button name="preference" value="mini">
                      Mini melhor
                    </button>
                    <button
                      name="preference"
                      value="equivalent"
                    >
                      Equivalentes
                    </button>
                    <button
                      name="preference"
                      value="both_bad"
                    >
                      Ambos ruins
                    </button>
                  </form>
                </section>
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            Nenhuma comparação registrada ainda.
          </div>
        )}
      </section>
    </main>
  );
}
