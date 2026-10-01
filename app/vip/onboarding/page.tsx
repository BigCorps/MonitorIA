import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSetupCameras,
  getOrganizationSites,
  getSiteAgentStatus,
} from "@/src/lib/dashboard-data";
import { getCameraProfileWorkspace } from "@/src/lib/camera-profile-data";
import { ensureSalesTrialForOrganization } from "@/src/lib/sales-trial-context";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { getFirstRunStatusAction } from "@/app/dashboard/first-run-status";
import { InstallerPlatformActions } from "@/src/components/installer-platform-actions";
import { SitePairingCode } from "@/app/dashboard/site-pairing-code";
import { DiscoveryPanel } from "@/app/dashboard/cameras/discovery/discovery-panel";
import { OnboardingCameraContext } from "@/app/dashboard/onboarding-camera-context";
import {
  SalesCameraSelection,
  type SalesCameraOption,
} from "@/app/dashboard/trial/sales/sales-camera-selection";
import { readinessReasonLabel } from "@/src/trial/status";
import { TrialCountdown } from "@/app/dashboard/trial/trial-countdown";
import { VipLiveRefresh } from "@/src/components/vip-live-refresh";
import { getVipTrialLiveSnapshotByProject } from "@/src/vip/live";
import { VipAssistantPanel } from "./vip-assistant-panel";
import { getVipPlanCatalog, getVipProjectForOrganization } from "@/src/vip/server";
import { refreshVipOnboarding } from "@/src/vip/onboarding-server";
import {
  VIP_ONBOARDING_STEPS,
  readinessAction,
  vipNextAction,
  vipProgressPercent,
  vipStepIndex,
} from "@/src/vip/onboarding";
import {
  prepareVipTrialAction,
  refreshVipTrialAction,
  startVipTrialAction,
} from "./actions";
import styles from "./vip-onboarding.module.css";

export const metadata = { title: "Implantação VIP" };
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

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(cents / 100);
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

export default async function VipOnboardingPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  await ensureSalesTrialForOrganization(user, organization.id);

  const project = await getVipProjectForOrganization(organization.id);
  if (!project) redirect("/dashboard");

  const [onboarding, firstRun, sites, setupCameras, cameras, plans, query] =
    await Promise.all([
      refreshVipOnboarding(project.id, true),
      getFirstRunStatusAction(),
      getOrganizationSites(organization.id),
      getOrganizationSetupCameras(organization.id),
      getOrganizationCameras(organization.id),
      getVipPlanCatalog(),
      searchParams,
    ]);

  const refreshedProject = await getVipProjectForOrganization(organization.id);
  if (!refreshedProject) redirect("/dashboard");

  const plan =
    plans.find((item) => item.code === refreshedProject.selectedPlanCode) ?? null;
  const site = sites[0] ?? null;
  const agentStatus = await getSiteAgentStatus(organization.id);
  const canManage = ["owner", "admin"].includes(organization.role);
  const nextAction = vipNextAction(
    onboarding.attentionCode,
    onboarding.snapshot,
  );
  const stepIndex = vipStepIndex(onboarding.status, onboarding.attentionCode);
  const progress = vipProgressPercent(onboarding.status, onboarding.attentionCode);

  const admin = createAdminClient();
  const { data: seller } = await admin
    .from("sales_operators")
    .select("name,email")
    .eq("id", refreshedProject.salesOperatorId)
    .maybeSingle();

  let context: {
    camera: {
      id: string;
      name: string;
      status: string;
      createdAt: string;
      setupNamedAt: string | null;
    };
    workspace: Awaited<ReturnType<typeof getCameraProfileWorkspace>>;
    cameraIndex: number;
  } | null = null;

  if (firstRun.phase === "context" && firstRun.firstCameraId) {
    const cameraId = firstRun.firstCameraId;
    const { data: cameraRow } = await admin
      .from("cameras")
      .select("id,name,status,created_at,setup_named_at")
      .eq("organization_id", organization.id)
      .eq("id", cameraId)
      .maybeSingle();

    if (cameraRow) {
      context = {
        camera: {
          id: String(cameraRow.id),
          name: String(cameraRow.name),
          status: String(cameraRow.status ?? "pending"),
          createdAt: String(cameraRow.created_at),
          setupNamedAt: cameraRow.setup_named_at
            ? String(cameraRow.setup_named_at)
            : null,
        },
        workspace: await getCameraProfileWorkspace(organization.id, cameraId),
        cameraIndex: Math.max(
          1,
          setupCameras.findIndex((camera) => camera.id === cameraId) + 1,
        ),
      };
    }
  }

  const supabase = await createClient();
  const { data: trial } = await supabase
    .from("trial_runs")
    .select(
      "id,status,trial_mode,duration_minutes,max_cameras,capture_started_at,capture_ends_at,capture_completed_at,exploration_ends_at",
    )
    .eq("organization_id", organization.id)
    .eq("vip_project_id", refreshedProject.id)
    .maybeSingle();

  const live = trial
    ? await getVipTrialLiveSnapshotByProject(refreshedProject.id)
    : null;

  let selectedIds: string[] = [];
  let cameraOptions: SalesCameraOption[] = [];

  if (trial) {
    const [participantsResult, readinessResults] = await Promise.all([
      supabase
        .from("trial_run_cameras")
        .select("camera_id,status")
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
            ready: !error && row.ready === true,
            reasons: Array.isArray(row.reasons)
              ? row.reasons.map((reason) => String(reason))
              : error
                ? ["readiness_unavailable"]
                : [],
          };
        }),
      ),
    ]);

    selectedIds = (participantsResult.data ?? []).map((row) =>
      String(row.camera_id),
    );
    const readinessMap = new Map(
      readinessResults.map((row) => [row.cameraId, row]),
    );

    cameraOptions = cameras.map((camera) => {
      const readiness = readinessMap.get(camera.id);
      return {
        id: camera.id,
        name: camera.name,
        siteName: camera.siteName,
        description: camera.description,
        ready: Boolean(readiness?.ready),
        reasons: readiness?.reasons ?? [],
      };
    });
  }

  const selectedSet = new Set(selectedIds);
  const selectedReadiness = onboarding.snapshot.cameraReadiness.filter((item) =>
    item.cameraId ? selectedSet.has(item.cameraId) : false,
  );
  const allSelectedReady =
    selectedIds.length > 0 &&
    selectedReadiness.length === selectedIds.length &&
    selectedReadiness.every((item) => item.ready);

  const message = firstValue(query.message);
  const error = firstValue(query.error);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/vip/onboarding" className={styles.brand}>
          Monitor<span>IA</span>
          <b>VIP</b>
        </Link>
        <div className={styles.topMeta}>
          <span>{organization.name}</span>
          <strong>{plan?.displayName ?? "MonitorIA VIP"}</strong>
        </div>
      </header>

      <section className={styles.shell}>
        <aside className={styles.summary}>
          <span className={styles.eyebrow}>IMPLANTAÇÃO ACOMPANHADA</span>
          <h1>{refreshedProject.name}</h1>
          <p>
            {projectKindLabel(refreshedProject.projectKind)} ·{" "}
            {refreshedProject.expectedCameraCount} câmeras previstas
          </p>

          <div className={styles.contractCard}>
            <span>PROJETO SELECIONADO</span>
            <strong>{plan?.displayName ?? refreshedProject.selectedPlanCode}</strong>
            {plan ? (
              <>
                <small>
                  {plan.includedCameras} câmeras Intensive incluídas
                </small>
                <small>
                  {money(plan.monthlyAmountCents)}/mês ·{" "}
                  {money(plan.annualAmountCents)}/ano
                </small>
              </>
            ) : null}
          </div>

          <div className={styles.sellerCard}>
            <span>ESPECIALISTA RESPONSÁVEL</span>
            <strong>{seller?.name ? String(seller.name) : "Equipe MonitorIA VIP"}</strong>
            {seller?.email ? <small>{String(seller.email)}</small> : null}
            <p>
              Seu especialista acompanha esta implantação e a demonstração.
              Nenhuma senha de câmera é exibida para o vendedor.
            </p>
          </div>

          <div className={styles.resumeCard}>
            <strong>Seu progresso fica salvo</strong>
            <p>
              Pode sair e voltar quando precisar. O MonitorIA retorna exatamente
              à próxima ação necessária, sem reiniciar o teste.
            </p>
          </div>
        </aside>

        <section className={styles.content}>
          <div className={styles.progressCard}>
            <div className={styles.progressHeading}>
              <div>
                <span>PROGRESSO DA IMPLANTAÇÃO</span>
                <strong>{progress}%</strong>
              </div>
              <div className={styles.progressTrack}>
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className={styles.steps}>
              {VIP_ONBOARDING_STEPS.map((step, index) => (
                <div
                  key={step.id}
                  data-current={index === stepIndex}
                  data-complete={index < stepIndex || onboarding.status === "active"}
                >
                  <span>{index < stepIndex ? "✓" : index + 1}</span>
                  <small>{step.label}</small>
                </div>
              ))}
            </div>
          </div>

          {message ? <div className={styles.success}>{message}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}

          <section className={styles.nextAction}>
            <div>
              <span>PRÓXIMA AÇÃO</span>
              <h2>{nextAction.title}</h2>
              <p>{nextAction.description}</p>
            </div>
            <div className={styles.readinessFacts}>
              <div>
                <strong>{onboarding.snapshot.agentsOnline}</strong>
                <span>Agent(s) online</span>
              </div>
              <div>
                <strong>{onboarding.snapshot.camerasTotal}</strong>
                <span>câmeras encontradas</span>
              </div>
              <div>
                <strong>
                  {onboarding.snapshot.trialReadyCameras}/
                  {onboarding.snapshot.trialCameras}
                </strong>
                <span>prontas no piloto</span>
              </div>
            </div>
          </section>

          <section className={styles.workSurface}>
            {firstRun.phase === "connect" && site ? (
              <div className={styles.workSection}>
                <div className={styles.sectionHeading}>
                  <span>INSTALAÇÃO</span>
                  <h2>Conecte o computador que enxerga as câmeras</h2>
                  <p>
                    Instale o MonitorIA no computador da operação. O relógio dos
                    60 minutos ainda não começa nesta etapa.
                  </p>
                </div>
                <div className={styles.installGrid}>
                  <div>
                    <h3>1. Instale no computador da operação</h3>
                    <InstallerPlatformActions />
                  </div>
                  <div>
                    <h3>2. Conecte o local ao projeto</h3>
                    <SitePairingCode />
                  </div>
                </div>
              </div>
            ) : null}

            {firstRun.phase === "discover" ? (
              <div className={styles.workSection}>
                <div className={styles.sectionHeading}>
                  <span>CÂMERAS</span>
                  <h2>Agora encontre as câmeras da rede</h2>
                  <p>
                    Faça a busca aqui. As câmeras encontradas permanecem salvas
                    e você pode repetir a descoberta sem apagar as anteriores.
                  </p>
                </div>
                <DiscoveryPanel
                  onboarding
                  hasAgent={agentStatus.paired}
                  defaultCameraCount={Math.max(
                    1,
                    Math.min(refreshedProject.expectedCameraCount, 64),
                  )}
                />
              </div>
            ) : null}

            {firstRun.phase === "context" ? (
              <div className={styles.workSection}>
                <div className={styles.sectionHeading}>
                  <span>CALIBRAÇÃO</span>
                  <h2>Identifique e ensine o contexto de cada câmera</h2>
                  <p>
                    A configuração acontece aqui mesmo. Conclua uma câmera por
                    vez; a próxima abre automaticamente.
                  </p>
                </div>
                {context ? (
                  <OnboardingCameraContext
                    camera={context.camera}
                    workspace={context.workspace}
                    canManage={canManage}
                    cameraIndex={context.cameraIndex}
                    cameraTotal={setupCameras.length}
                    hasAgent={agentStatus.paired}
                    defaultCameraCount={Math.max(
                      1,
                      Math.min(refreshedProject.expectedCameraCount, 64),
                    )}
                  />
                ) : (
                  <div className={styles.waiting}>
                    <strong>Preparando a próxima câmera…</strong>
                    <p>
                      Assim que a imagem e os dados estiverem disponíveis, esta
                      etapa continua automaticamente.
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            {(firstRun.phase === "commercial" ||
              onboarding.attentionCode === "select_trial_cameras" ||
              onboarding.attentionCode === "resolve_camera_readiness" ||
              onboarding.attentionCode === "ready_to_start") &&
            trial ? (
              <div className={styles.workSection}>
                <div className={styles.sectionHeading}>
                  <span>PILOTO VIP</span>
                  <h2>Escolha até {Number(trial.max_cameras ?? 6)} câmeras</h2>
                  <p>
                    Todas serão Intensive. O relógio de 60 minutos só começa
                    depois que as câmeras selecionadas estiverem prontas e você
                    confirmar o início na próxima etapa.
                  </p>
                </div>

                <form action={prepareVipTrialAction}>
                  <SalesCameraSelection
                    cameras={cameraOptions}
                    selectedIds={selectedIds}
                    maxCameras={Number(trial.max_cameras ?? 6)}
                  />
                  {canManage && cameraOptions.length ? (
                    <button className={styles.primaryButton} type="submit">
                      Salvar seleção e verificar prontidão
                    </button>
                  ) : null}
                </form>

                {selectedIds.length ? (
                  <div className={styles.readinessList}>
                    <div className={styles.readinessHeader}>
                      <div>
                        <strong>Prontidão do piloto</strong>
                        <span>
                          {onboarding.snapshot.trialReadyCameras}/
                          {onboarding.snapshot.trialCameras} prontas
                        </span>
                      </div>
                      {canManage ? (
                        <form action={refreshVipTrialAction}>
                          <button className={styles.secondaryButton} type="submit">
                            Verificar novamente
                          </button>
                        </form>
                      ) : null}
                    </div>

                    {selectedReadiness.map((camera) => (
                      <article key={camera.cameraId ?? camera.cameraName ?? "camera"}>
                        <div>
                          <strong>{camera.cameraName ?? "Câmera"}</strong>
                          <span>{camera.ready ? "Pronta para o piloto" : "Ainda há pendência"}</span>
                        </div>
                        {camera.ready ? (
                          <b className={styles.readyBadge}>PRONTA</b>
                        ) : (
                          <div className={styles.pendingReasons}>
                            {camera.reasons.slice(0, 3).map((reason) => {
                              const action = readinessAction(reason, camera.cameraId);
                              return (
                                <div key={`${camera.cameraId}-${reason}`}>
                                  <span>{readinessReasonLabel(reason)}</span>
                                  <Link href={action.href}>{action.label}</Link>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : null}

                {selectedReadiness.some((item) => !item.ready) ? (
                  <section id="readiness-help" className={styles.helpPanel}>
                    <span>COMO RESOLVER</span>
                    <h3>Corrija a pendência e depois clique em “Verificar novamente”.</h3>
                    <ul>
                      {selectedReadiness.flatMap((camera) =>
                        camera.ready
                          ? []
                          : camera.reasons.slice(0, 3).map((reason) => (
                              <li key={`${camera.cameraId}-${reason}-help`}>
                                <strong>{camera.cameraName ?? "Câmera"}</strong>
                                <span>{readinessReasonLabel(reason)}</span>
                              </li>
                            )),
                      )}
                    </ul>
                    <p>
                      Para problemas do Agent, abra o MonitorIA no computador da operação.
                      Para câmera offline ou pareamento, confira energia, rede e credenciais e
                      repita a descoberta se necessário. Nenhuma dessas verificações inicia o trial.
                    </p>
                  </section>
                ) : null}

                {allSelectedReady && String(trial.status) === "ready" ? (
                  <div className={styles.readyToStart}>
                    <span>TUDO PRONTO</span>
                    <h3>As câmeras estão prontas e o relógio continua parado.</h3>
                    <p>
                      O piloto só começa quando você confirmar abaixo. A partir desse
                      clique, cliente e vendedor passam a ver o mesmo relógio de 60 minutos.
                    </p>
                    {canManage ? (
                      <form action={startVipTrialAction}>
                        <button className={styles.startTrialButton} type="submit">
                          Iniciar os 60 minutos agora
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {onboarding.status === "trial_running" && live ? (
              <div className={styles.liveTrial}>
                <VipLiveRefresh intervalMs={10_000} />
                <div className={styles.liveTrialHeader}>
                  <div>
                    <span>● PILOTO VIP EM ANDAMENTO</span>
                    <h2>O MonitorIA está analisando sua operação agora.</h2>
                    <p>
                      Cliente e vendedor usam o mesmo relógio. As métricas abaixo
                      são atualizadas automaticamente sem reiniciar a sessão.
                    </p>
                  </div>
                  {live.captureEndsAt ? (
                    <TrialCountdown target={live.captureEndsAt} label="Tempo restante" />
                  ) : null}
                </div>

                <div className={styles.liveMetrics}>
                  <div><span>CÂMERAS</span><strong>{live.camerasOnline}/{live.cameraCount}</strong><small>online no piloto</small></div>
                  <div><span>ACONTECIMENTOS</span><strong>{live.eventCount}</strong><small>já consolidados</small></div>
                  <div><span>PESQUISA IA</span><strong>{live.assistantRemaining}</strong><small>perguntas restantes</small></div>
                  <div><span>AGENTS</span><strong>{live.agentsOnline}</strong><small>online agora</small></div>
                </div>

                <div className={styles.liveCameraGrid}>
                  {live.cameras.map((camera) => (
                    <article key={camera.id}>
                      <div><span>{camera.siteName}</span><strong>{camera.name}</strong></div>
                      <div className={styles.liveCameraStatus}>
                        <b data-online={camera.cameraStatus === "online"}>
                          {camera.cameraStatus === "online" ? "Câmera online" : "Câmera offline"}
                        </b>
                        <small>{camera.agentStatus === "online" ? "Agent online" : "Agent requer atenção"}</small>
                      </div>
                    </article>
                  ))}
                </div>

                <VipAssistantPanel initialRemaining={live.assistantRemaining} />
              </div>
            ) : null}

            {onboarding.status === "trial_completed" && live ? (
              <div className={styles.completedTrial}>
                <VipLiveRefresh intervalMs={30_000} />
                <div className={styles.completedHeader}>
                  <span>CAPTURA CONCLUÍDA</span>
                  <h2>Os 60 minutos terminaram, mas a análise continua disponível.</h2>
                  <p>
                    Nenhuma nova captura gratuita é iniciada. Os dados já registrados
                    permanecem acessíveis durante o período de exploração e podem ser
                    consultados pela Pesquisa IA antes da proposta comercial.
                  </p>
                </div>
                <div className={styles.liveMetrics}>
                  <div><span>CÂMERAS</span><strong>{live.cameraCount}</strong><small>participaram do piloto</small></div>
                  <div><span>ACONTECIMENTOS</span><strong>{live.eventCount}</strong><small>registrados</small></div>
                  <div><span>PESQUISA IA</span><strong>{live.assistantRemaining}</strong><small>perguntas restantes</small></div>
                  <div><span>STATUS</span><strong>Concluído</strong><small>captura encerrada</small></div>
                </div>
                <VipAssistantPanel
                  initialRemaining={live.assistantRemaining}
                  trialFinished
                />
                <strong className={styles.inlineNotice}>
                  O Gate 4 transformará esses dados no relatório de prova de valor e na proposta comercial, sem sair deste fluxo.
                </strong>
              </div>
            ) : null}
          </section>

          <footer className={styles.footerNote}>
            <strong>MonitorIA VIP</strong>
            <span>
              Implantação assistida · todas as câmeras em modo Intensive ·
              teste de 60 minutos com até 6 câmeras
            </span>
          </footer>
        </section>
      </section>
    </main>
  );
}
