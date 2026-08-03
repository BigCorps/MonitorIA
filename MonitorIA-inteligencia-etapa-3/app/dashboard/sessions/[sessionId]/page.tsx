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
import { DashboardSidebar } from "../../dashboard-sidebar";
import styles from "../sessions.module.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ sessionId: string }>;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function durationLabel(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded} segundos`;
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secondsLeft = rounded % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return secondsLeft ? `${minutes}m ${secondsLeft}s` : `${minutes} minutos`;
}

function participantRoleLabel(role: string) {
  if (role === "staff") return "Funcionário provável";
  if (role === "customer") return "Cliente provável";
  if (role === "delivery_person") return "Entregador provável";
  if (role === "visitor") return "Visitante provável";
  return "Pessoa provável";
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
            ← Voltar às sessões
          </Link>

          <header className="dashboard-header">
            <div>
              <span className="dashboard-eyebrow">
                {operationalSessionTypeLabel(session.sessionType).toUpperCase()}
              </span>
              <h1>{session.title}</h1>
              <p>{session.summary}</p>
            </div>

            <Link className="panel-primary-action" href="/dashboard/events">
              Ver linha do tempo
            </Link>
          </header>
        </div>

        <section className={styles.summaryCard}>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryMetric}>
              <span>Estado</span>
              <strong>{operationalSessionStatusLabel(session.status)}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Duração observada</span>
              <strong>{durationLabel(session.durationSeconds)}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Capítulos</span>
              <strong>{session.chapterCount}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Confiança</span>
              <strong>{Math.round(session.confidence * 100)}%</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Início</span>
              <strong>{formatDate(session.startedAt)}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Último registro</span>
              <strong>{formatDate(session.endedAt)}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Clientes/visitantes</span>
              <strong>{session.probableCustomerCount}</strong>
            </div>
            <div className={styles.summaryMetric}>
              <span>Funcionários</span>
              <strong>{session.probableStaffCount}</strong>
            </div>
          </div>
        </section>

        <section className={styles.participantsCard}>
          <h2 className={styles.sectionTitle}>Participantes prováveis</h2>
          <div className={styles.participantList}>
            {session.participants.length ? (
              session.participants.map((participant) => (
                <div className={styles.participant} key={participant.id}>
                  <strong>
                    {participant.staffLabel ??
                      participantRoleLabel(participant.role)}
                  </strong>
                  <p>
                    {participantRoleLabel(participant.role)} · observado de {" "}
                    {formatDate(participant.firstSeenAt)} até {" "}
                    {formatDate(participant.lastSeenAt)} · confiança {" "}
                    {Math.round(participant.confidence * 100)}%
                  </p>
                </div>
              ))
            ) : (
              <div className={styles.participant}>
                <strong>Sem participante estruturado</strong>
                <p>A sessão pode ter sido criada por estado visual ou equipamento.</p>
              </div>
            )}
          </div>
        </section>

        <section className={styles.outcomesCard}>
          <h2 className={styles.sectionTitle}>Resultados visuais</h2>
          <div className={styles.outcomeList}>
            {session.outcomes.length ? (
              session.outcomes.map((outcome) => (
                <div className={styles.outcome} key={outcome.code}>
                  <strong>{operationalSessionOutcomeLabel(outcome.code)}</strong>
                  <p>
                    {outcome.description} Confiança aproximada: {" "}
                    {Math.round(outcome.confidence * 100)}%. O resultado não
                    confirma venda, pagamento ou intenção sem integração externa.
                  </p>
                </div>
              ))
            ) : (
              <div className={styles.outcome}>
                <strong>Sem resultado conclusivo</strong>
                <p>A sequência ainda está em andamento ou não mostrou um desfecho.</p>
              </div>
            )}
          </div>
        </section>

        <section className={styles.timelineCard}>
          <h2 className={styles.sectionTitle}>Capítulos da sessão</h2>
          <div className={styles.timeline}>
            {session.chapters.map((chapter) => (
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
                    CAPÍTULO {chapter.chapterOrder} · {" "}
                    {operationalSessionChapterLabel(chapter.chapterType)}
                  </span>
                  <h3>{chapter.headline}</h3>
                  <p>
                    {formatDate(chapter.startedAt)} · {chapter.summary}
                  </p>
                  <Link href={`/dashboard/events/${chapter.eventId}`}>
                    Abrir evidência individual →
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
