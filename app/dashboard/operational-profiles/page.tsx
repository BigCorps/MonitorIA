import Link from "next/link";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
} from "@/src/lib/dashboard-data";
import { getStaffOperationalProfileOverview } from "@/src/lib/staff-operational-profile-data";
import {
  actionCodeLabel,
  confidencePercent,
  shiftWindowLabel,
  staffCandidateStatusLabel,
  staffDecisionLabel,
  staffProfileStatusLabel,
} from "@/src/lib/staff-operational-profile-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import {
  reviewStaffCandidateAction,
  reviewStaffMatchAction,
  reviewStaffProposalAction,
  saveStaffProfileAction,
} from "./actions";
import { ProfilesRealtimeRefresh } from "./profiles-realtime-refresh";
import styles from "./profiles.module.css";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function formatDate(value: string | null) {
  if (!value) return "Ainda sem observação recente";
  return new Date(value).toLocaleString("pt-BR");
}

function tags(
  values: string[],
  mapper: (value: string) => string = (value) => value,
) {
  if (!values.length) {
    return <span className={styles.muted}>Ainda aprendendo</span>;
  }

  return (
    <div className={styles.tags}>
      {values.map((value, index) => (
        <span key={`${value}-${index}`}>{mapper(value)}</span>
      ))}
    </div>
  );
}

export default async function OperationalProfilesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) return <main>Organização não encontrada.</main>;

  const canManage = new Set(["owner", "admin"]).has(organization.role);
  const params = await searchParams;
  const cameraId = param(params.camera);
  const status = param(params.status);

  const [cameras, overview] = await Promise.all([
    getOrganizationCameras(organization.id),
    getStaffOperationalProfileOverview(organization.id, {
      cameraId: cameraId || null,
      status: status || null,
      limit: 180,
    }),
  ]);

  const pendingCandidates = overview.candidates.filter(
    (candidate) => candidate.status === "pending_review",
  );
  const learningCandidates = overview.candidates.filter(
    (candidate) => candidate.status === "learning",
  );

  return (
    <div className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="operational-profiles"
      />

      <main className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PADRÕES · {organization.name.toUpperCase()}
            </span>
            <h1>Padrões da operação</h1>
            <p>
              O MonitorIA aprende horários, áreas e atividades recorrentes da
              equipe. As revisões feitas aqui ajudam as próximas análises, sem
              reconhecimento facial.
            </p>
          </div>
          <ProfilesRealtimeRefresh organizationId={organization.id} />
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.learningIntro}>
          <div>
            <strong>Como o aprendizado funciona</strong>
            <p>
              O MonitorIA observa recorrências e só mostra uma sugestão quando
              há sinal suficiente. Confirmações e correções humanas são usadas
              nas análises seguintes. Mudanças em um padrão aprovado nunca são
              aplicadas automaticamente: o administrador precisa aprovar.
            </p>
          </div>
          <span>Aprendizado com revisão</span>
        </section>

        <section
          className={styles.metrics}
          aria-label="Resumo dos padrões da operação"
        >
          <article>
            <strong>{overview.summary.activeProfiles}</strong>
            <span>Padrões ativos</span>
          </article>
          <article>
            <strong>{pendingCandidates.length}</strong>
            <span>Novos padrões para revisar</span>
          </article>
          <article>
            <strong>{overview.summary.pendingDecisions}</strong>
            <span>Situações para confirmar</span>
          </article>
          <article>
            <strong>{overview.summary.pendingProposals}</strong>
            <span>Melhorias sugeridas</span>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtrar padrões</summary>
          <form>
            <label>
              Câmera
              <select name="camera" defaultValue={cameraId}>
                <option value="">Todas</option>
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estado
              <select name="status" defaultValue={status}>
                <option value="">Todos</option>
                <option value="active">Ativos</option>
                <option value="paused">Pausados</option>
                <option value="retired">Encerrados</option>
              </select>
            </label>
            <div className={styles.filterActions}>
              <button type="submit">Aplicar</button>
              <Link href="/dashboard/operational-profiles">Limpar</Link>
            </div>
          </form>
        </details>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>PADRÕES APROVADOS</span>
              <h2>O que o MonitorIA já conhece</h2>
            </div>
            <small>{overview.profiles.length} padrões</small>
          </div>

          <div className={styles.profileGrid}>
            {overview.profiles.length ? (
              overview.profiles.map((profile) => (
                <article className={styles.profileCard} key={profile.id}>
                  <header>
                    <div>
                      <span>{profile.cameraName}</span>
                      <h3>{profile.label}</h3>
                    </div>
                    <span
                      className={`${styles.status} ${styles[profile.status]}`}
                    >
                      {staffProfileStatusLabel(profile.status)}
                    </span>
                  </header>

                  <p>
                    {profile.description ||
                      "Padrão recorrente aprovado para esta câmera."}
                  </p>

                  <div className={styles.patternSummary}>
                    <div>
                      <strong>Horários habituais</strong>
                      {profile.shiftWindows.length ? (
                        <ul>
                          {profile.shiftWindows.map((window) => (
                            <li key={`${window.weekday}-${window.startMinute}`}>
                              {shiftWindowLabel(window)}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className={styles.muted}>
                          Ainda sem horário estável
                        </span>
                      )}
                    </div>

                    <div>
                      <strong>Áreas habituais</strong>
                      {tags(profile.habitualZoneNames)}
                    </div>

                    <div>
                      <strong>Atividades recorrentes</strong>
                      {tags(profile.habitualActionCodes, actionCodeLabel)}
                    </div>
                  </div>

                  <footer>
                    <span>
                      Última observação: {formatDate(profile.lastObservedAt)}
                    </span>
                    {profile.pendingProposalCount ? (
                      <strong>
                        {profile.pendingProposalCount} melhoria para revisar
                      </strong>
                    ) : null}
                  </footer>

                  <details className={styles.learningDetails}>
                    <summary>Detalhes do aprendizado</summary>
                    <div className={styles.profileStats}>
                      <span>
                        <strong>{confidencePercent(profile.confidence)}</strong>
                        consistência
                      </span>
                      <span>
                        <strong>{profile.observationCount}</strong>
                        observações
                      </span>
                      <span>
                        <strong>{profile.distinctDaysCount}</strong>
                        dias observados
                      </span>
                      <span>
                        <strong>v{profile.version}</strong>
                        versão
                      </span>
                    </div>

                    <div className={styles.profileSection}>
                      <strong>Características visuais recorrentes</strong>
                      {tags(profile.recurringAppearanceSummary)}
                    </div>

                    <p className={styles.privacyNote}>
                      Essas características são sinais visuais amplos usados
                      junto com horário, área e atividade. Não há
                      reconhecimento facial nem identificação civil.
                    </p>
                  </details>

                  {canManage ? (
                    <details className={styles.editor}>
                      <summary>Ajustar este padrão</summary>
                      <form action={saveStaffProfileAction}>
                        <input
                          type="hidden"
                          name="profile_id"
                          value={profile.id}
                        />
                        <input
                          type="hidden"
                          name="expected_version"
                          value={profile.version}
                        />

                        <label>
                          Nome do padrão
                          <input
                            name="label"
                            defaultValue={profile.label}
                            maxLength={120}
                            required
                          />
                        </label>

                        <label>
                          Descrição
                          <textarea
                            name="description"
                            defaultValue={profile.description}
                            maxLength={600}
                          />
                        </label>

                        <label>
                          Estado
                          <select
                            name="profile_status"
                            defaultValue={profile.status}
                          >
                            <option value="active">Ativo</option>
                            <option value="paused">Pausado</option>
                            <option value="retired">Encerrado</option>
                          </select>
                        </label>

                        <label>
                          Como este padrão deve evoluir
                          <select
                            name="update_mode"
                            defaultValue={profile.updateMode}
                          >
                            <option value="reviewed_learning">
                              Aprender e sugerir mudanças para eu aprovar
                            </option>
                            <option value="manual">
                              Manter fixo até eu editar
                            </option>
                          </select>
                        </label>

                        <details className={styles.advancedSettings}>
                          <summary>Ajuste avançado</summary>
                          <label>
                            Sensibilidade mínima de associação
                            <input
                              type="number"
                              name="min_similarity"
                              min="0.5"
                              max="1"
                              step="0.01"
                              defaultValue={profile.minSimilarity}
                            />
                            <small>
                              Quanto maior, mais conservador o MonitorIA fica ao
                              relacionar uma nova observação a este padrão.
                            </small>
                          </label>
                        </details>

                        <label>
                          Motivo da alteração
                          <textarea name="notes" maxLength={600} />
                        </label>

                        <button type="submit">Salvar alterações</button>
                      </form>
                    </details>
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                Nenhum padrão aprovado encontrado para este filtro.
              </div>
            )}
          </div>
        </section>

        {canManage ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span>REVISÃO HUMANA</span>
                  <h2>Novos padrões para revisar</h2>
                </div>
                <small>
                  {learningCandidates.length
                    ? `${learningCandidates.length} ainda sendo observados`
                    : "Nada pendente em observação"}
                </small>
              </div>

              <p className={styles.sectionHelp}>
                Possibilidades ainda em aprendizado ficam em segundo plano e
                só aparecem para aprovação quando acumulam evidência suficiente.
              </p>

              <div className={styles.reviewList}>
                {pendingCandidates.length ? (
                  pendingCandidates.map((candidate) => (
                    <article className={styles.reviewCard} key={candidate.id}>
                      <header>
                        <div>
                          <span>{candidate.cameraName}</span>
                          <h3>{candidate.suggestedLabel}</h3>
                        </div>
                        <strong>
                          {staffCandidateStatusLabel(candidate.status)}
                        </strong>
                      </header>

                      <p>
                        O MonitorIA observou uma recorrência em dias e contextos
                        suficientes para pedir sua confirmação.
                      </p>

                      <div className={styles.profileSection}>
                        <strong>Áreas observadas</strong>
                        {tags(candidate.zoneNames)}
                      </div>

                      <div className={styles.profileSection}>
                        <strong>Atividades recorrentes</strong>
                        {tags(candidate.actionCodes, actionCodeLabel)}
                      </div>

                      <div className={styles.evidenceLinks}>
                        {candidate.evidenceEventIds
                          .slice(0, 4)
                          .map((eventId) => (
                            <Link
                              key={eventId}
                              href={`/dashboard/events/${eventId}`}
                            >
                              Ver acontecimento
                            </Link>
                          ))}
                      </div>

                      <details className={styles.learningDetails}>
                        <summary>Detalhes do aprendizado</summary>
                        <p>
                          {candidate.observationCount} observações em{" "}
                          {candidate.distinctDaysCount} dias · consistência{" "}
                          {confidencePercent(candidate.confidence)}.
                        </p>
                        {tags(candidate.appearanceSummary)}
                      </details>

                      <form
                        action={reviewStaffCandidateAction}
                        className={styles.reviewForm}
                      >
                        <input
                          type="hidden"
                          name="candidate_id"
                          value={candidate.id}
                        />
                        <input
                          type="hidden"
                          name="min_similarity"
                          value="0.74"
                        />

                        <label>
                          Nome do padrão
                          <input
                            name="label"
                            defaultValue={candidate.suggestedLabel}
                            maxLength={120}
                          />
                        </label>

                        <label>
                          Descrição opcional
                          <textarea name="description" maxLength={600} />
                        </label>

                        <label>
                          Observação opcional
                          <textarea name="notes" maxLength={600} />
                        </label>

                        <div>
                          <button name="action" value="approve">
                            Aprovar padrão
                          </button>
                          <button
                            className={styles.secondary}
                            name="action"
                            value="keep_learning"
                          >
                            Continuar observando
                          </button>
                          <button
                            className={styles.danger}
                            name="action"
                            value="reject"
                          >
                            Rejeitar sugestão
                          </button>
                        </div>
                      </form>
                    </article>
                  ))
                ) : (
                  <div className={styles.empty}>
                    Nenhum novo padrão aguardando revisão.
                  </div>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span>CONFIRMAÇÕES</span>
                  <h2>Situações que precisam da sua decisão</h2>
                </div>
                <small>{overview.decisions.length} pendentes</small>
              </div>

              <p className={styles.sectionHelp}>
                Quando uma ocorrência fica parecida com mais de uma hipótese, o
                MonitorIA pede confirmação em vez de assumir.
              </p>

              <div className={styles.reviewList}>
                {overview.decisions.length ? (
                  overview.decisions.map((decision) => (
                    <article className={styles.reviewCard} key={decision.id}>
                      <header>
                        <div>
                          <span>{decision.cameraName}</span>
                          <h3>{staffDecisionLabel(decision.decision)}</h3>
                        </div>
                        <strong>Precisa de confirmação</strong>
                      </header>

                      <p>
                        {decision.staffProfileLabel
                          ? `O padrão mais provável é “${decision.staffProfileLabel}”.`
                          : "O MonitorIA não encontrou um padrão aprovado com segurança suficiente."}
                      </p>

                      <Link href={`/dashboard/events/${decision.eventId}`}>
                        Abrir acontecimento
                      </Link>

                      <details className={styles.learningDetails}>
                        <summary>Detalhes do aprendizado</summary>
                        <div className={styles.scoreGrid}>
                          <span>
                            Aparência{" "}
                            {confidencePercent(decision.appearanceScore)}
                          </span>
                          <span>
                            Área {confidencePercent(decision.zoneScore)}
                          </span>
                          <span>
                            Atividade {confidencePercent(decision.actionScore)}
                          </span>
                          <span>
                            Horário{" "}
                            {confidencePercent(decision.scheduleScore)}
                          </span>
                        </div>
                        <ul>
                          {decision.reasons.slice(0, 6).map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </details>

                      <form
                        action={reviewStaffMatchAction}
                        className={styles.reviewForm}
                      >
                        <input
                          type="hidden"
                          name="decision_id"
                          value={decision.id}
                        />

                        <label>
                          Associar a
                          <select
                            name="target_profile_id"
                            defaultValue={decision.staffProfileId ?? ""}
                          >
                            <option value="">Escolha um padrão</option>
                            {overview.profiles
                              .filter(
                                (profile) =>
                                  profile.cameraId === decision.cameraId &&
                                  profile.status === "active",
                              )
                              .map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                  {profile.label}
                                </option>
                              ))}
                          </select>
                        </label>

                        <label>
                          Observação opcional
                          <textarea name="notes" maxLength={600} />
                        </label>

                        <div>
                          {decision.staffProfileId ? (
                            <button name="verdict" value="confirm">
                              Confirmar sugestão
                            </button>
                          ) : null}
                          <button
                            className={styles.secondary}
                            name="verdict"
                            value="reassign"
                          >
                            Associar ao padrão escolhido
                          </button>
                          <button
                            className={styles.secondary}
                            name="verdict"
                            value="uncertain"
                          >
                            Continuar observando
                          </button>
                          <button
                            className={styles.danger}
                            name="verdict"
                            value="not_staff"
                          >
                            Não é equipe
                          </button>
                        </div>
                      </form>

                      <p className={styles.feedbackNote}>
                        “Não é equipe” passa a ser usado como referência
                        contextual nas próximas análises parecidas, sem criar
                        identificação biométrica.
                      </p>
                    </article>
                  ))
                ) : (
                  <div className={styles.empty}>
                    Nenhuma situação aguardando confirmação.
                  </div>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span>APRENDIZADO CONTROLADO</span>
                  <h2>Melhorias sugeridas</h2>
                </div>
                <small>{overview.proposals.length} pendentes</small>
              </div>

              <p className={styles.sectionHelp}>
                O MonitorIA pode perceber que horários, áreas ou atividades
                mudaram. Ele sugere a atualização, mas só altera o padrão após
                sua aprovação.
              </p>

              <div className={styles.reviewList}>
                {overview.proposals.length ? (
                  overview.proposals.map((proposal) => (
                    <article className={styles.reviewCard} key={proposal.id}>
                      <header>
                        <div>
                          <span>{proposal.cameraName}</span>
                          <h3>{proposal.staffProfileLabel}</h3>
                        </div>
                        <strong>Atualização sugerida</strong>
                      </header>

                      <p>
                        Novas observações indicam que este padrão pode estar
                        mudando.
                      </p>

                      <div className={styles.profileSection}>
                        <strong>Áreas sugeridas</strong>
                        {tags(proposal.proposedZoneNames)}
                      </div>

                      <div className={styles.profileSection}>
                        <strong>Atividades sugeridas</strong>
                        {tags(proposal.proposedActionCodes, actionCodeLabel)}
                      </div>

                      <div className={styles.profileSection}>
                        <strong>Horários sugeridos</strong>
                        {proposal.proposedShiftWindows.length ? (
                          <ul>
                            {proposal.proposedShiftWindows.map((window) => (
                              <li
                                key={`${window.weekday}-${window.startMinute}`}
                              >
                                {shiftWindowLabel(window)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className={styles.muted}>
                            Sem alteração de horário
                          </span>
                        )}
                      </div>

                      <details className={styles.learningDetails}>
                        <summary>Detalhes do aprendizado</summary>
                        <p>
                          {proposal.observationCount} novas observações em{" "}
                          {proposal.distinctDaysCount} dias · consistência{" "}
                          {confidencePercent(proposal.confidence)}.
                        </p>
                        {tags(proposal.proposedAppearanceSummary)}
                      </details>

                      <form
                        action={reviewStaffProposalAction}
                        className={styles.reviewForm}
                      >
                        <input
                          type="hidden"
                          name="proposal_id"
                          value={proposal.id}
                        />
                        <label>
                          Observação opcional
                          <textarea name="notes" maxLength={600} />
                        </label>
                        <div>
                          <button name="action" value="apply">
                            Aprovar atualização
                          </button>
                          <button
                            className={styles.danger}
                            name="action"
                            value="reject"
                          >
                            Manter padrão atual
                          </button>
                        </div>
                      </form>
                    </article>
                  ))
                ) : (
                  <div className={styles.empty}>
                    Nenhuma melhoria aguardando aprovação.
                  </div>
                )}
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
