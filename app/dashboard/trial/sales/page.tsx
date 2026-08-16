import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
} from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import {
  effectiveTrialStatus,
  formatTrialDate,
  readinessReasonLabel,
} from "@/src/trial/status";
import type { TrialStatus } from "@/src/trial/types";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { TrialCountdown } from "../trial-countdown";
import {
  prepareSalesTrialAction,
  refreshSalesTrialAction,
  startSalesTrialAction,
} from "./actions";
import {
  SalesCameraSelection,
  type SalesCameraOption,
} from "./sales-camera-selection";
import styles from "./sales-trial.module.css";

export const metadata = { title: "Demonstração assistida" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function minutesLabel(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "60 minutos" : `${hours} horas`;
  }
  return `${minutes} minutos`;
}

export default async function SalesTrialPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const [trialResult, cameras, query] = await Promise.all([
    supabase
      .from("trial_runs")
      .select(
        "id,status,trial_mode,duration_minutes,max_cameras,selected_plan_code,capture_started_at,capture_ends_at,capture_completed_at,exploration_ends_at,purge_after,interaction_limit,interactions_used,status_reason",
      )
      .eq("organization_id", organization.id)
      .maybeSingle(),
    getOrganizationCameras(organization.id),
    searchParams,
  ]);

  if (trialResult.error) {
    throw new Error(`sales_trial_unavailable:${trialResult.error.message}`);
  }

  const trial = trialResult.data as any;
  if (!trial || trial.trial_mode !== "sales_assisted") {
    redirect("/dashboard/trial");
  }

  const [participantsResult, readinessResults, eventResult, allowanceResult] =
    await Promise.all([
      supabase
        .from("trial_run_cameras")
        .select("camera_id,status,selected_plan_code,readiness_snapshot")
        .eq("trial_run_id", String(trial.id))
        .neq("status", "removed"),
      Promise.all(
        cameras.map(async (camera) => {
          const { data, error } = await supabase.rpc(
            "get_monitoria_trial_readiness",
            {
              p_organization_id: organization.id,
              p_camera_id: camera.id,
            },
          );
          const row = objectValue(data);
          return {
            cameraId: camera.id,
            ready: !error && Boolean(row.ready),
            reasons: Array.isArray(row.reasons)
              ? row.reasons.map((reason) => String(reason))
              : error
                ? ["readiness_unavailable"]
                : [],
          };
        }),
      ),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("trial_run_id", String(trial.id))
        .is("deleted_at", null),
      supabase
        .from("assistant_allowances")
        .select("included_interactions,used_interactions")
        .eq("organization_id", organization.id)
        .eq("source", "trial")
        .eq("source_reference_id", String(trial.id))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (participantsResult.error) {
    throw new Error(
      `sales_trial_cameras_unavailable:${participantsResult.error.message}`,
    );
  }

  const selectedIds = (participantsResult.data ?? []).map((row: any) =>
    String(row.camera_id),
  );
  const selectedSet = new Set(selectedIds);
  const readinessByCamera = new Map(
    readinessResults.map((row) => [row.cameraId, row]),
  );

  const cameraOptions: SalesCameraOption[] = cameras.map((camera) => {
    const readiness = readinessByCamera.get(camera.id);
    return {
      id: camera.id,
      name: camera.name,
      siteName: camera.siteName,
      description: camera.description,
      ready: Boolean(readiness?.ready),
      reasons: readiness?.reasons ?? [],
    };
  });

  const selectedCameras = cameraOptions.filter((camera) =>
    selectedSet.has(camera.id),
  );
  const allReady =
    selectedCameras.length > 0 && selectedCameras.every((camera) => camera.ready);
  const status = effectiveTrialStatus({
    status: String(trial.status) as TrialStatus,
    captureEndsAt: trial.capture_ends_at
      ? String(trial.capture_ends_at)
      : null,
    explorationEndsAt: trial.exploration_ends_at
      ? String(trial.exploration_ends_at)
      : null,
  });
  const durationMinutes = Number(trial.duration_minutes ?? 60);
  const maxCameras = Number(trial.max_cameras ?? 6);
  const canManage = organization.role === "owner" || organization.role === "admin";
  const includedInteractions = Number(
    allowanceResult.data?.included_interactions ?? trial.interaction_limit ?? 21,
  );
  const usedInteractions = Number(
    allowanceResult.data?.used_interactions ?? trial.interactions_used ?? 0,
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="trial"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className={`dashboard-header ${styles.header}`}>
          <div>
            <span className="dashboard-eyebrow">
              DEMONSTRAÇÃO ASSISTIDA · {organization.name.toUpperCase()}
            </span>
            <h1>{minutesLabel(durationMinutes)} para ver o MonitorIA em ação</h1>
            <p>
              Escolha até {maxCameras} câmeras. O relógio só começa depois que
              todas as selecionadas estiverem prontas e você confirmar o início.
            </p>
          </div>
          <div className={styles.headerBadge}>
            <span>MODO LIBERADO</span>
            <strong>Detalhada · até {maxCameras} câmeras</strong>
          </div>
        </header>

        <DashboardSectionTabs group="settings" />

        {firstValue(query.message) ? (
          <div className={styles.success}>{firstValue(query.message)}</div>
        ) : null}
        {firstValue(query.error) ? (
          <div className={styles.error}>{firstValue(query.error)}</div>
        ) : null}

        <section className={styles.facts}>
          <div><span>DURAÇÃO</span><strong>{minutesLabel(durationMinutes)}</strong><small>Começa somente após sua confirmação.</small></div>
          <div><span>CÂMERAS</span><strong>Até {maxCameras}</strong><small>Todas compartilham o mesmo relógio.</small></div>
          <div><span>PLANO DO TESTE</span><strong>Detalhada</strong><small>Inclui o contexto visual mais completo.</small></div>
          <div><span>PAGAMENTO</span><strong>Sem cartão</strong><small>Contrate apenas se fizer sentido.</small></div>
        </section>

        {(status === "draft" || status === "ready") ? (
          <>
            <form action={prepareSalesTrialAction} className={styles.setupCard}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>PASSO 1</span>
                  <h2>Escolha as câmeras da demonstração</h2>
                </div>
                <strong>Máximo {maxCameras}</strong>
              </div>

              {cameraOptions.length ? (
                <SalesCameraSelection
                  cameras={cameraOptions}
                  selectedIds={selectedIds}
                  maxCameras={maxCameras}
                />
              ) : (
                <div className={styles.emptyState}>
                  <strong>Nenhuma câmera cadastrada ainda.</strong>
                  <p>Instale o Agent e conclua a descoberta das câmeras antes de montar a demonstração.</p>
                  <Link href="/dashboard/installer">Abrir instalação</Link>
                </div>
              )}

              {canManage && cameraOptions.length ? (
                <button className={styles.primaryButton} type="submit">
                  Salvar seleção e verificar prontidão
                </button>
              ) : null}
            </form>

            {selectedCameras.length ? (
              <section className={styles.readinessCard}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>PASSO 2</span>
                    <h2>Prontidão das câmeras escolhidas</h2>
                  </div>
                  <strong>
                    {selectedCameras.filter((camera) => camera.ready).length}/
                    {selectedCameras.length} prontas
                  </strong>
                </div>

                <div className={styles.readinessList}>
                  {selectedCameras.map((camera) => (
                    <div className={styles.readinessRow} key={camera.id}>
                      <div>
                        <strong>{camera.name}</strong>
                        <span>{camera.siteName}</span>
                      </div>
                      <div className={camera.ready ? styles.readyText : styles.pendingText}>
                        {camera.ready
                          ? "Pronta para o teste"
                          : camera.reasons
                              .slice(0, 2)
                              .map((reason) => readinessReasonLabel(reason))
                              .join(" ") || "Existe uma pendência na configuração."}
                      </div>
                    </div>
                  ))}
                </div>

                {canManage ? (
                  <form action={refreshSalesTrialAction}>
                    <button className={styles.secondaryButton} type="submit">
                      Atualizar prontidão
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}

            {status === "ready" && allReady ? (
              <section className={styles.startCard}>
                <div>
                  <span>PASSO 3 · TUDO PRONTO</span>
                  <h2>O relógio ainda não começou</h2>
                  <p>
                    Ao clicar abaixo, todas as {selectedCameras.length} câmera(s)
                    começam juntas e param automaticamente após {minutesLabel(durationMinutes)}.
                  </p>
                </div>
                {canManage ? (
                  <form action={startSalesTrialAction}>
                    <button className={styles.startButton} type="submit">
                      Iniciar meus {minutesLabel(durationMinutes)} agora
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {status === "running" ? (
          <section className={styles.runningCard}>
            <div className={styles.runningHeader}>
              <div>
                <span>● DEMONSTRAÇÃO EM ANDAMENTO</span>
                <h2>{selectedCameras.length} câmera(s) analisando em conjunto</h2>
                <p>O servidor encerra automaticamente a captura quando o relógio chegar a zero.</p>
              </div>
              {trial.capture_ends_at ? (
                <TrialCountdown
                  target={String(trial.capture_ends_at)}
                  label="Tempo restante"
                />
              ) : null}
            </div>
            <div className={styles.metrics}>
              <div><span>ACONTECIMENTOS</span><strong>{eventResult.count ?? 0}</strong></div>
              <div><span>PERGUNTAS RESTANTES</span><strong>{Math.max(0, includedInteractions - usedInteractions)}/{includedInteractions}</strong></div>
              <div><span>FINAL DA ANÁLISE</span><strong>{formatTrialDate(trial.capture_ends_at ? String(trial.capture_ends_at) : null)}</strong></div>
            </div>
            <div className={styles.actionRow}>
              <Link href="/dashboard/events">Ver acontecimentos</Link>
              <Link href="/dashboard/search">Pesquisar com IA</Link>
            </div>
          </section>
        ) : null}

        {(status === "exploration" || status === "capture_completed") ? (
          <section className={styles.completeCard}>
            <span>DEMONSTRAÇÃO CONCLUÍDA</span>
            <h2>Agora veja o que o MonitorIA encontrou</h2>
            <p>
              As novas análises gratuitas foram encerradas, mas os resultados continuam disponíveis durante o período de exploração.
            </p>
            <div className={styles.metrics}>
              <div><span>ACONTECIMENTOS</span><strong>{eventResult.count ?? 0}</strong></div>
              <div><span>DADOS PROTEGIDOS ATÉ</span><strong>{formatTrialDate(trial.purge_after ? String(trial.purge_after) : null)}</strong></div>
            </div>
            <div className={styles.actionRow}>
              <Link href="/dashboard/events">Explorar acontecimentos</Link>
              <Link href="/dashboard/search">Perguntar para a IA</Link>
              <Link className={styles.primaryLink} href="/dashboard/plans">Escolher planos</Link>
            </div>
          </section>
        ) : null}

        {(status === "expired" || status === "purged") ? (
          <section className={styles.completeCard}>
            <span>TESTE ENCERRADO</span>
            <h2>A demonstração gratuita terminou</h2>
            <p>A configuração permanece salva. Escolha os planos das câmeras para continuar monitorando.</p>
            <div className={styles.actionRow}>
              <Link className={styles.primaryLink} href="/dashboard/plans">Contratar MonitorIA</Link>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
