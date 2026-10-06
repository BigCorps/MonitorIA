import Link from "next/link";
import { notFound } from "next/navigation";
import { TrialCountdown } from "@/app/dashboard/trial/trial-countdown";
import { requireCommercialAccess } from "@/src/lib/commercial-operator";
import { getSalesTrialResultsById } from "@/src/lib/trial-results";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { VipLiveRefresh } from "@/src/components/vip-live-refresh";
import { getVipTrialLiveSnapshotByProject } from "@/src/vip/live";
import {
  VIP_ONBOARDING_STEPS,
  vipNextAction,
  vipProgressPercent,
  vipStepIndex,
} from "@/src/vip/onboarding";
import {
  VIP_PROJECT_STATUSES,
  type VipOnboardingSnapshot,
  type VipProjectStatus,
} from "@/src/vip/types";
import { vipAssistAlias } from "@/src/vip/assisted";
import styles from "./assisted-live.module.css";

export const metadata = { title: "Acompanhamento VIP | MonitorIA" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ projectId: string }> };

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function sectionLabel(value: unknown) {
  const labels: Record<string, string> = {
    inicio: "Início da apresentação",
    como_funciona: "Como funciona",
    evidencias: "Vídeos e evidências",
    inteligencia: "Inteligência",
    planos: "Pacotes VIP",
    duvidas: "Dúvidas",
    pronto: "Pronto para começar",
  };
  return labels[String(value ?? "")] ?? "Ainda não abriu a landing";
}

function normalizedStatus(value: unknown): VipProjectStatus {
  const status = String(value ?? "") as VipProjectStatus;
  return VIP_PROJECT_STATUSES.includes(status) ? status : "lead";
}

export default async function VipAssistedLivePage({ params }: Props) {
  const access = await requireCommercialAccess();
  const { projectId } = await params;
  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from("vip_projects")
    .select(
      "id,company_name,lead_name,lead_email,status,sales_operator_id,onboarding_attention_code,onboarding_last_activity_at,onboarding_snapshot,updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) notFound();
  if (
    !access.isManager &&
    String(project.sales_operator_id) !== String(access.operator?.id ?? "")
  ) {
    notFound();
  }

  const [inviteResult, live] = await Promise.all([
    admin
      .from("sales_trial_invites")
      .select("id,metadata,expires_at,revoked_at,redeemed_at,trial_run_id,updated_at")
      .eq("vip_project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getVipTrialLiveSnapshotByProject(projectId),
  ]);

  if (inviteResult.error) {
    throw new Error(`vip_assisted_invite_unavailable:${inviteResult.error.message}`);
  }

  const invite = inviteResult.data;
  const trialId = live?.trialId ?? (invite?.trial_run_id ? String(invite.trial_run_id) : null);
  const results = trialId ? await getSalesTrialResultsById(trialId) : null;

  const metadata = objectValue(invite?.metadata);
  const assisted = objectValue(metadata.assistedJourney);
  const lastSeenAt = assisted.lastSeenAt ? String(assisted.lastSeenAt) : null;
  const seenAge = lastSeenAt ? Date.now() - new Date(lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const landingOnline = Number.isFinite(seenAge) && seenAge >= 0 && seenAge < 35_000;
  const status = normalizedStatus(project.status);
  const attention = project.onboarding_attention_code
    ? String(project.onboarding_attention_code)
    : null;
  const snapshot = objectValue(project.onboarding_snapshot) as Partial<VipOnboardingSnapshot>;
  const progress = vipProgressPercent(status, attention);
  const stepIndex = vipStepIndex(status, attention);
  const nextAction = vipNextAction(attention, snapshot);
  const alias = invite?.id ? vipAssistAlias(String(invite.id)) : "VIP—";
  const inviteExpired = invite?.expires_at
    ? new Date(String(invite.expires_at)).getTime() <= Date.now()
    : false;
  const inviteState = invite?.revoked_at
    ? "Revogado"
    : invite?.redeemed_at
      ? "Ativado"
      : inviteExpired
        ? "Expirado"
        : invite
          ? "Disponível"
          : "Não criado";

  return (
    <main className={styles.page}>
      <VipLiveRefresh intervalMs={3_000} />

      <header className={styles.header}>
        <div>
          <span>ACOMPANHAMENTO ASSISTIDO · {alias}</span>
          <h1>{String(project.company_name)}</h1>
          <p>{String(project.lead_name)} · {String(project.lead_email)}</p>
        </div>
        <aside>
          <small>Especialista</small>
          <strong>{access.operator?.name ?? access.user.email}</strong>
          <Link href={`/comercial/vip/${projectId}`}>Abrir resumo comercial →</Link>
          <small className={styles.sync}>● AO VIVO · Atualização automática · até 3 s</small>
        </aside>
      </header>

      <section className={styles.content}>
        <section className={styles.heroGrid}>
          <article className={styles.liveCard} data-online={landingOnline}>
            <span>LANDING VIP</span>
            <strong>{landingOnline ? "● Lead na página agora" : inviteState}</strong>
            <p>Seção atual/mais recente: <b>{sectionLabel(assisted.lastSection)}</b></p>
            <small>Último sinal: {formatDate(lastSeenAt)}</small>
          </article>
          <article className={styles.liveCard}>
            <span>CLARITY AO VIVO</span>
            <strong>{alias}</strong>
            <p>Use este Custom User ID em Live recordings para abrir a navegação visual da landing pública.</p>
            <small>O token do convite não é enviado ao Clarity.</small>
          </article>
          <article className={styles.liveCard}>
            <span>COMEÇAR</span>
            <strong>{assisted.startClickedAt ? "Lead avançou" : "Ainda na apresentação"}</strong>
            <p>{assisted.startClickedAt ? `Clicou em começar em ${formatDate(assisted.startClickedAt)}.` : "Aguardando “Estou pronto. Vamos começar”."}</p>
            <small>Convite: {inviteState}</small>
          </article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <span>IMPLANTAÇÃO</span>
              <h2>{progress}% concluído</h2>
            </div>
            <strong>Última atividade: {formatDate(project.onboarding_last_activity_at)}</strong>
          </div>
          <div className={styles.progressTrack}><i style={{ width: `${progress}%` }} /></div>
          <div className={styles.steps}>
            {VIP_ONBOARDING_STEPS.map((step, index) => (
              <div key={step.id} data-current={index === stepIndex} data-complete={index < stepIndex || status === "active"}>
                <b>{index < stepIndex ? "✓" : index + 1}</b>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
          <div className={styles.nextAction}>
            <span>PRÓXIMA AÇÃO DO CLIENTE</span>
            <strong>{nextAction.title}</strong>
            <p>{nextAction.description}</p>
          </div>
          <div className={styles.metrics}>
            <div><span>AGENTS ONLINE</span><strong>{Number(snapshot.agentsOnline ?? live?.agentsOnline ?? 0)}</strong></div>
            <div><span>CÂMERAS ENCONTRADAS</span><strong>{Number(snapshot.camerasTotal ?? 0)}</strong></div>
            <div><span>NO PILOTO</span><strong>{Number(snapshot.trialCameras ?? live?.cameraCount ?? 0)}</strong></div>
            <div><span>PRONTAS</span><strong>{Number(snapshot.trialReadyCameras ?? 0)}</strong></div>
          </div>
        </section>

        {live ? (
          <section className={`${styles.panel} ${styles.trialPanel}`}>
            <div className={styles.trialHeader}>
              <div>
                <span>{live.trialStatus === "running" ? "● PILOTO VIP AO VIVO" : "PILOTO VIP"}</span>
                <h2>{live.trialStatus === "running" ? "O mesmo relógio do cliente" : live.trialStatus.replaceAll("_", " ")}</h2>
                <p>Atualização automática em até 3 segundos, sem abrir stream nem imagem da câmera.</p>
              </div>
              {live.trialStatus === "running" && live.captureEndsAt ? (
                <TrialCountdown target={live.captureEndsAt} label="Tempo restante" compact />
              ) : null}
            </div>
            <div className={styles.metrics}>
              <div><span>CÂMERAS ONLINE</span><strong>{live.camerasOnline}/{live.cameraCount}</strong></div>
              <div><span>ACONTECIMENTOS</span><strong>{live.eventCount}</strong></div>
              <div><span>VÍDEOS PRESERVADOS</span><strong>{results?.clipCount ?? 0}</strong></div>
              <div><span>PESQUISA IA</span><strong>{live.assistantUsed}/{live.assistantIncluded}</strong></div>
            </div>
            <div className={styles.cameras}>
              {live.cameras.map((camera) => {
                const resultCamera = results?.cameras.find((item) => item.id === camera.id);
                return (
                  <article key={camera.id}>
                    <div><span>{camera.siteName}</span><strong>{camera.name}</strong></div>
                    <div>
                      <b data-online={camera.cameraStatus === "online"}>{camera.cameraStatus === "online" ? "Online" : "Atenção"}</b>
                      <small>{resultCamera?.eventCount ?? 0} acontecimentos · {resultCamera?.clipCount ?? 0} vídeos</small>
                    </div>
                  </article>
                );
              })}
            </div>
            {trialId ? (
              <Link className={styles.resultsLink} href={`/dashboard/admin/customers/trials/${trialId}/results`}>
                Abrir acompanhamento e resultados completos →
              </Link>
            ) : null}
          </section>
        ) : null}

        <section className={styles.security}>
          <strong>Fronteira de privacidade</strong>
          <p>
            A landing pública pode ser vista no Clarity. A partir da conta/onboarding,
            este painel acompanha somente estado operacional e resultados consolidados.
            Senhas, URLs RTSP, imagens/keyframes e o vídeo privado do cliente não são
            transmitidos ao vendedor por este acompanhamento.
          </p>
        </section>
      </section>
    </main>
  );
}
