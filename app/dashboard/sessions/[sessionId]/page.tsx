import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getOperationalSessionDetail } from "@/src/lib/operational-session-data";
import {
  operationalSessionChapterLabel,
  operationalSessionOutcomeLabel,
  operationalSessionStatusLabel,
  operationalSessionTypeLabel,
} from "@/src/lib/operational-session-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringDuration,
  monitoringConfidenceLabel,
} from "@/src/lib/monitoring-display";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../../monitoring-analysis-details";
import styles from "../sessions.module.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

function participantRoleLabel(role: string) {
  if (role === "staff") return "Equipe";
  if (role === "customer") return "Cliente provável";
  if (role === "delivery_person") return "Entregador provável";
  if (role === "visitor") return "Visitante provável";
  return "Pessoa observada";
}

export default async function SessionDetailPage({
  params,
}: {
  params: Params;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const { sessionId } = await params;
  const session = await getOperationalSessionDetail(
    organization.id,
    sessionId,
  );

  if (!session) notFound();

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="sessions"
      />

      <section className="dashboard-content">
        <div className={styles.detailHeader}>
          <Link className={styles.backLink} href="/dashboard/sessions">
            ← Voltar aos períodos
          </Link>

          <header className="dashboard-header">
            <div>
              <span className="dashboard-eyebrow">
                {operationalSessionTypeLabel(
                  session.sessionType,
                ).toUpperCase()}
              </span>
              <h1>{session.title}</h1>
              <p>{session.summary}</p>
            </div>

            <Link className="panel-primary-action" href="/dashboard/events">
              Ver acontecimentos
            </Link>
          </header>
        </div>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.summaryCard}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryMetric}>
              <span>Situação</span>
              <strong>
                {operationalSessionStatusLabel(session.status)}
              </strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Duração</span>
              <strong>
                {formatMonitoringDuration(session.durationSeconds)}
              </strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Início</span>
              <strong>
                {formatMonitoringDateTime(
                  session.startedAt,
                  session.timezone,
                )}
              </strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Fim / último registro</span>
              <strong>
                {formatMonitoringDateTime(
                  session.endedAt,
                  session.timezone,
                )}
              </strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Clientes ou visitantes</span>
              <strong>{session.probableCustomerCount}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Equipe</span>
              <strong>{session.probableStaffCount}</strong>
            </div>
          </div>
        </section>

        <section className={styles.participantsCard}>
          <div className={styles.sectionHeading}>
            <div>
              <span>PARTICIPANTES</span>
              <h2>Quem apareceu neste período</h2>
            </div>
          </div>

          <div className={styles.participantList}>
            {session.participants.length ? (
              session.participants.map((participant) => (
                <div className={styles.participant} key={participant.id}>
                  <strong>
                    {participant.staffLabel ??
                      participantRoleLabel(participant.role)}
                  </strong>
                  <p>
                    {participantRoleLabel(participant.role)} · observado de{" "}
                    {formatMonitoringDateTime(
                      participant.firstSeenAt,
                      session.timezone,
                    )}{" "}
                    até{" "}
                    {formatMonitoringDateTime(
                      participant.lastSeenAt,
                      session.timezone,
                    )}
                  </p>
                </div>
              ))
            ) : (
              <div className={styles.participant}>
                <strong>Sem participante identificado no período</strong>
                <p>
                  A atividade pode ter sido registrada por uma mudança no
                  ambiente, objeto ou equipamento.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className={styles.outcomesCard}>
          <div className={styles.sectionHeading}>
            <div>
              <span>RESULTADO OBSERVADO</span>
              <h2>Como este período terminou</h2>
            </div>
          </div>

          <div className={styles.outcomeList}>
            {session.outcomes.length ? (
              session.outcomes.map((outcome) => (
                <div className={styles.outcome} key={outcome.code}>
                  <strong>
                    {operationalSessionOutcomeLabel(outcome.code)}
                  </strong>
                  <p>{outcome.description}</p>
                </div>
              ))
            ) : (
              <div className={styles.outcome}>
                <strong>Sem resultado visual conclusivo</strong>
                <p>
                  Não houve imagem suficiente para confirmar um desfecho
                  específico deste período.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className={styles.timelineCard}>
          <div className={styles.sectionHeading}>
            <div>
              <span>REGISTROS DESTE PERÍODO</span>
              <h2>O que formou esta atividade</h2>
            </div>
            <small>
              {session.chapterCount} registro
              {session.chapterCount === 1 ? "" : "s"} relacionado
              {session.chapterCount === 1 ? "" : "s"}
            </small>
          </div>

          <div className={styles.timeline}>
            {session.chapters.map((chapter, index) => (
              <article className={styles.chapter} key={chapter.id}>
                <div className={styles.chapterImage}>
                  {chapter.thumbnailAssetId ? (
                    <img
                      src={`/api/storage-assets/${chapter.thumbnailAssetId}`}
                      alt=""
                    />
                  ) : (
                    <img src="/favicon.svg" alt="" />
                  )}
                </div>
                <div className={styles.chapterBody}>
                  <span>
                    REGISTRO {index + 1} ·{" "}
                    {operationalSessionChapterLabel(
                      chapter.chapterType,
                    )}
                  </span>
                  <h3>{chapter.headline}</h3>
                  <p>
                    {formatMonitoringDateTime(
                      chapter.startedAt,
                      session.timezone,
                    )}{" "}
                    · {chapter.summary}
                  </p>
                  <Link href={`/dashboard/events/${chapter.eventId}`}>
                    Ver acontecimento →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.analysisDetailsWrap}>
          <MonitoringAnalysisDetails
            title="Detalhes da análise"
            description="Informações adicionais sobre o agrupamento e o nível de certeza."
          >
            <div className={styles.technicalGrid}>
              <dl>
                <div>
                  <dt>Tipo do período</dt>
                  <dd>
                    {operationalSessionTypeLabel(session.sessionType)}
                  </dd>
                </div>
                <div>
                  <dt>Nível de certeza</dt>
                  <dd>
                    {monitoringConfidenceLabel(session.confidence)} ·{" "}
                    {Math.round(session.confidence * 100)}%
                  </dd>
                </div>
                <div>
                  <dt>Registros relacionados</dt>
                  <dd>{session.chapterCount}</dd>
                </div>
                <div>
                  <dt>Resultado usado</dt>
                  <dd>
                    {operationalSessionOutcomeLabel(
                      session.outcomeCode,
                    )}
                  </dd>
                </div>
                {session.closureReason ? (
                  <div>
                    <dt>Motivo técnico do encerramento</dt>
                    <dd>{session.closureReason}</dd>
                  </div>
                ) : null}
              </dl>

              <p className={styles.technicalNote}>
                Pessoas e correspondências entre registros são estimativas
                visuais. O MonitorIA não usa reconhecimento facial para
                identificar pessoas.
              </p>
            </div>
          </MonitoringAnalysisDetails>
        </section>
      </section>
    </main>
  );
}
