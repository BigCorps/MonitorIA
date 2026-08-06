import Link from "next/link";
import { redirect } from "next/navigation";
import { formatBrl } from "@/src/billing/pricing";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getTrialDashboardData } from "@/src/lib/trial-data";
import {
  formatTrialDate,
  readinessItems,
  readinessReasonLabel,
  trialStatusLabel,
  trialStatusTone,
} from "@/src/trial/status";
import type {
  TrialCamera,
  TrialRun,
} from "@/src/trial/types";
import { DashboardSidebar } from "../dashboard-sidebar";
import {
  prepareTrialAction,
  refreshTrialAction,
  startTrialAction,
} from "./actions";
import { TrialAutoRefresh } from "./trial-auto-refresh";
import { TrialCountdown } from "./trial-countdown";
import styles from "./trial.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Teste grátis" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    message?: string;
    error?: string;
  }>;
};

function selectedCamera(
  cameras: TrialCamera[],
  trial: TrialRun | null,
) {
  return trial?.cameraId
    ? cameras.find((camera) => camera.id === trial.cameraId) ?? null
    : null;
}

function CameraSelection({
  cameras,
  selectedId,
}: {
  cameras: TrialCamera[];
  selectedId: string | null;
}) {
  if (!cameras.length) {
    return (
      <div className={styles.emptyState}>
        <strong>Nenhuma câmera cadastrada</strong>
        <p>
          Instale o Agent, pareie uma câmera e aprove o perfil
          inteligente antes de preparar o teste.
        </p>
        <Link href="/dashboard/installer">Abrir instalador</Link>
      </div>
    );
  }

  return (
    <div className={styles.cameraGrid}>
      {cameras.map((camera, index) => {
        const ready = camera.readiness.ready;
        const inputId = `trial-camera-${camera.id}`;

        return (
          <label className={styles.cameraCard} htmlFor={inputId} key={camera.id}>
            <input
              id={inputId}
              type="radio"
              name="camera_id"
              value={camera.id}
              defaultChecked={
                selectedId ? selectedId === camera.id : index === 0
              }
              required
            />
            <span className={styles.selectionMark} aria-hidden="true" />
            <div>
              <span className={styles.cardEyebrow}>{camera.siteName}</span>
              <strong>{camera.name}</strong>
              <small>{camera.description || "Câmera monitorada"}</small>
            </div>
            <span
              className={
                ready ? styles.readyBadge : styles.pendingBadge
              }
            >
              {ready ? "Pronta" : "Com pendências"}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ReadinessPanel({ camera }: { camera: TrialCamera }) {
  const items = readinessItems(camera.readiness);

  return (
    <section className={styles.readinessCard}>
      <div className={styles.sectionHeading}>
        <div>
          <span>PRONTIDÃO</span>
          <h2>{camera.name}</h2>
        </div>
        <strong>
          {items.filter((item) => item.complete).length}/{items.length}
        </strong>
      </div>

      <div className={styles.checklist}>
        {items.map((item) => (
          <div key={item.id}>
            <span
              className={
                item.complete ? styles.checkComplete : styles.checkPending
              }
              aria-hidden="true"
            >
              {item.complete ? "✓" : "!"}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>

      {!camera.readiness.ready && camera.readiness.reasons.length ? (
        <div className={styles.pendingReasons}>
          {camera.readiness.reasons.map((reason) => (
            <p key={reason}>{readinessReasonLabel(reason)}</p>
          ))}
        </div>
      ) : null}

      <form action={refreshTrialAction}>
        <button className={styles.secondaryButton} type="submit">
          Verificar novamente
        </button>
      </form>
    </section>
  );
}

function TrialFacts() {
  return (
    <section className={styles.factGrid}>
      <div>
        <span>ANÁLISE</span>
        <strong>24 horas reais</strong>
        <small>O relógio começa somente após sua confirmação.</small>
      </div>
      <div>
        <span>EXPLORAÇÃO</span>
        <strong>7 dias</strong>
        <small>Pesquise eventos e converse com a IA.</small>
      </div>
      <div>
        <span>ASSISTENTE IA</span>
        <strong>21 interações</strong>
        <small>Falhas não reduzem sua franquia.</small>
      </div>
      <div>
        <span>PAGAMENTO</span>
        <strong>Sem cartão</strong>
        <small>Contratação posterior por Pix.</small>
      </div>
    </section>
  );
}

export default async function TrialPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const [data, query] = await Promise.all([
    getTrialDashboardData(organization.id, organization.role),
    searchParams,
  ]);

  const trial = data.trial;
  const camera = selectedCamera(data.cameras, trial);
  const selectedPlan = trial?.selectedPlanCode
    ? data.plans.find((plan) => plan.code === trial.selectedPlanCode) ?? null
    : null;

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
              TESTE GRÁTIS · {organization.name.toUpperCase()}
            </span>
            <h1>Veja o MonitorIA trabalhando na sua própria câmera</h1>
            <p>
              Escolha uma câmera e qualquer modo. O sistema analisará
              acontecimentos reais durante 24 horas e manterá os resultados
              disponíveis por mais sete dias.
            </p>
          </div>

          <div className={styles.headerBadge}>
            <span>SEM CARTÃO</span>
            <strong>1 câmera grátis</strong>
          </div>
        </header>

        <DashboardSectionTabs group="settings" />


        {query.message ? (
          <div className={styles.successNotice}>{query.message}</div>
        ) : null}
        {query.error ? (
          <div className={styles.errorNotice}>{query.error}</div>
        ) : null}

        <TrialFacts />

        {trial && ["running", "capture_completed", "exploration"].includes(trial.status) ? (
          <TrialAutoRefresh />
        ) : null}

        {!trial || trial.status === "draft" || trial.status === "ready" ? (
          <>
            <form action={prepareTrialAction} className={styles.setupForm}>
              <section className={styles.setupSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>PASSO 1</span>
                    <h2>Escolha a primeira câmera</h2>
                  </div>
                  <strong>1 de {data.cameras.length}</strong>
                </div>
                <CameraSelection
                  cameras={data.cameras}
                  selectedId={trial?.cameraId ?? null}
                />
              </section>

              <section className={styles.setupSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>PASSO 2</span>
                    <h2>Escolha o modo que deseja experimentar</h2>
                  </div>
                  <strong>Qualquer plano</strong>
                </div>

                <div className={styles.planGrid}>
                  {data.plans.map((plan, index) => {
                    const inputId = `trial-plan-${plan.code}`;
                    return (
                      <label className={styles.planCard} htmlFor={inputId} key={plan.code}>
                        <input
                          id={inputId}
                          type="radio"
                          name="plan_code"
                          value={plan.code}
                          defaultChecked={
                            trial?.selectedPlanCode
                              ? trial.selectedPlanCode === plan.code
                              : index === 0
                          }
                          required
                        />
                        <span className={styles.selectionMark} aria-hidden="true" />
                        <span className={styles.cardEyebrow}>
                          {plan.code === "intensive" ? "MAIS COMPLETO" : "MODO"}
                        </span>
                        <strong>{plan.displayName}</strong>
                        <p>{plan.shortDescription}</p>
                        <div className={styles.planPrice}>
                          <span>{formatBrl(plan.amountCents)}</span>
                          <small>/câmera após o teste</small>
                        </div>
                        <ul>
                          <li>{plan.longTermKeyframes} imagem(ns) por evento</li>
                          <li>Histórico pesquisável por 365 dias</li>
                          <li>
                            {plan.clipEnabled
                              ? `Clipes de ${plan.clipDurationSeconds ?? 15}s`
                              : "Análise por imagens selecionadas"}
                          </li>
                        </ul>
                      </label>
                    );
                  })}
                </div>
              </section>

              {data.canManage && data.cameras.length ? (
                <button className={styles.primaryButton} type="submit">
                  Salvar câmera e modo
                </button>
              ) : null}
            </form>

            {camera ? <ReadinessPanel camera={camera} /> : null}

            {trial?.status === "ready" && camera?.readiness.ready ? (
              <section className={styles.startCard}>
                <div>
                  <span>TUDO PRONTO</span>
                  <h2>As 24 horas começam apenas quando você clicar</h2>
                  <p>
                    Depois de iniciado, a câmera e o modo ficam bloqueados.
                    Mantenha o computador e o Agent ligados durante o período.
                  </p>
                </div>
                {data.canManage ? (
                  <form action={startTrialAction}>
                    <button className={styles.startButton} type="submit">
                      Iniciar minhas 24 horas grátis
                    </button>
                  </form>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}

        {trial?.status === "running" ? (
          <section className={styles.liveCard}>
            <div className={styles.liveHeader}>
              <div>
                <span className={styles.liveDot}>●</span>
                <span>ANÁLISE AO VIVO</span>
                <h2>{camera?.name ?? "Câmera do teste"}</h2>
                <p>
                  Modo {selectedPlan?.displayName ?? trial.selectedPlanCode}.
                  O Agent será bloqueado automaticamente ao chegar ao horário
                  final, inclusive pelo servidor.
                </p>
              </div>
              {trial.captureEndsAt ? (
                <TrialCountdown
                  target={trial.captureEndsAt}
                  label="Tempo restante de análise"
                />
              ) : null}
            </div>

            <div className={styles.liveMetrics}>
              <div>
                <span>ACONTECIMENTOS</span>
                <strong>{data.eventCount}</strong>
              </div>
              <div>
                <span>IA DISPONÍVEL</span>
                <strong>
                  {data.allowance?.remainingInteractions ??
                    Math.max(0, trial.interactionLimit - trial.interactionsUsed)}
                  /{trial.interactionLimit}
                </strong>
              </div>
              <div>
                <span>FINAL DA COLETA</span>
                <strong>{formatTrialDate(trial.captureEndsAt)}</strong>
              </div>
            </div>

            <div className={styles.actionRow}>
              <Link href="/dashboard/events">Ver acontecimentos</Link>
              <Link href="/dashboard/search">Perguntar para a IA</Link>
            </div>
          </section>
        ) : null}

        {trial &&
        (trial.status === "capture_completed" ||
          trial.status === "exploration") ? (
          <section className={styles.explorationCard}>
            <div>
              <span>COLETA CONCLUÍDA</span>
              <h2>Agora explore tudo o que aconteceu</h2>
              <p>
                A câmera não gera novas análises gratuitas, mas os eventos,
                imagens, gráficos e perguntas permanecem disponíveis até o
                fim do período de exploração.
              </p>
            </div>

            {trial.explorationEndsAt ? (
              <TrialCountdown
                target={trial.explorationEndsAt}
                label="Tempo para explorar"
              />
            ) : null}

            <div className={styles.liveMetrics}>
              <div>
                <span>ACONTECIMENTOS</span>
                <strong>{data.eventCount}</strong>
              </div>
              <div>
                <span>PERGUNTAS RESTANTES</span>
                <strong>
                  {data.allowance?.remainingInteractions ?? 0}
                </strong>
              </div>
              <div>
                <span>DADOS PROTEGIDOS ATÉ</span>
                <strong>{formatTrialDate(trial.purgeAfter)}</strong>
              </div>
            </div>

            <div className={styles.actionRow}>
              <Link href="/dashboard/events">Explorar eventos</Link>
              <Link href="/dashboard/search">Conversar com a IA</Link>
              <Link className={styles.primaryLink} href="/dashboard/plans">
                Contratar MonitorIA
              </Link>
            </div>
          </section>
        ) : null}

        {trial?.status === "expired" ? (
          <section className={styles.expiredCard}>
            <span>TESTE ENCERRADO</span>
            <h2>Suas novas análises estão pausadas</h2>
            <p>
              A configuração da câmera e do Agent continua salva. Contrate um
              plano para reativar automaticamente, sem reinstalar nada.
            </p>
            {trial.purgeAfter ? (
              <TrialCountdown
                compact
                target={trial.purgeAfter}
                label="Prazo técnico antes da remoção dos dados"
              />
            ) : null}
            <div className={styles.actionRow}>
              <Link className={styles.primaryLink} href="/dashboard/plans">
                Escolher planos
              </Link>
              <Link href="/dashboard/billing">Ver cobranças</Link>
            </div>
          </section>
        ) : null}

        {trial?.status === "converted" ? (
          <section className={styles.convertedCard}>
            <span>SERVIÇO ATIVO</span>
            <h2>Seu teste foi convertido com sucesso</h2>
            <p>
              Os acontecimentos do teste foram preservados e a câmera agora
              segue o plano contratado e o ciclo exibido em Cobranças.
            </p>
            <div className={styles.actionRow}>
              <Link href="/dashboard/cameras">Ver câmeras</Link>
              <Link href="/dashboard/billing">Abrir cobrança</Link>
            </div>
          </section>
        ) : null}

        {trial?.status === "purged" ? (
          <section className={styles.expiredCard}>
            <span>DADOS REMOVIDOS</span>
            <h2>O período de teste foi finalizado</h2>
            <p>
              Os dados temporários foram excluídos conforme a política do
              teste. A câmera permanece cadastrada para uma futura contratação.
            </p>
            <div className={styles.actionRow}>
              <Link className={styles.primaryLink} href="/dashboard/plans">
                Contratar por câmera
              </Link>
            </div>
          </section>
        ) : null}

        {trial ? (
          <section className={styles.timelineCard}>
            <div className={styles.sectionHeading}>
              <div>
                <span>LINHA DO TEMPO</span>
                <h2>{trialStatusLabel(trial.status)}</h2>
              </div>
              <span
                className={`${styles.statusPill} ${
                  styles[trialStatusTone(trial.status)]
                }`}
              >
                {trial.status}
              </span>
            </div>
            <div className={styles.timeline}>
              <div>
                <span>Preparação</span>
                <strong>{formatTrialDate(trial.readyAt)}</strong>
              </div>
              <div>
                <span>Início</span>
                <strong>{formatTrialDate(trial.captureStartedAt)}</strong>
              </div>
              <div>
                <span>Fim das análises</span>
                <strong>{formatTrialDate(trial.captureEndsAt)}</strong>
              </div>
              <div>
                <span>Fim da exploração</span>
                <strong>{formatTrialDate(trial.explorationEndsAt)}</strong>
              </div>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
