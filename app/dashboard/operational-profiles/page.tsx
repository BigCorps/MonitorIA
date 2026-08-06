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
  sessionTypeLabel,
  shiftWindowLabel,
  staffCandidateStatusLabel,
  staffDecisionLabel,
  staffProfileStatusLabel,
  weekdayLabel,
} from "@/src/lib/staff-operational-profile-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import {
  reviewStaffCandidateAction,
  reviewStaffMatchAction,
  reviewStaffProposalAction,
  saveStaffProfileAction,
} from "./actions";
import { ProfilesRealtimeRefresh } from "./profiles-realtime-refresh";
import styles from "./profiles.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function tags(
  values: string[],
  mapper: (value: string) => string = (value) => value,
) {
  if (!values.length)
    return <span className={styles.muted}>Ainda sem padrão suficiente</span>;
  return (
    <div className={styles.tags}>
      {values.map((value) => (
        <span key={value}>{mapper(value)}</span>
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

  if (!canManage) {
    return (
      <div className="dashboard-shell">
        <DashboardSidebar
          organizationName={organization.name}
          userEmail={user.email}
          active="operational-profiles"
        />
        <main className={`dashboard-content ${styles.page}`}>
          <section className={styles.empty}>
            Os padrões da operação e suas revisões são visíveis apenas para
            administradores.
          </section>
        </main>
      </div>
    );
  }

  const params = await searchParams;
  const cameraId = param(params.camera);
  const status = param(params.status);

  const [cameras, overview] = await Promise.all([
    getOrganizationCameras(organization.id),
    getStaffOperationalProfileOverview(organization.id, {
      cameraId: cameraId || null,
      status: status || null,
      limit: 160,
    }),
  ]);

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
              Veja horários, locais e atividades recorrentes já revisados. O
              MonitorIA não identifica pessoas por rosto, biometria ou
              documentos.
            </p>
          </div>
          <ProfilesRealtimeRefresh organizationId={organization.id} />
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section
          className={styles.metrics}
          aria-label="Resumo dos padrões da operação"
        >
          <article>
            <strong>{overview.summary.activeProfiles}</strong>
            <span>Padrões ativos</span>
          </article>
          <article>
            <strong>{overview.summary.learningProfiles}</strong>
            <span>Em aprendizado</span>
          </article>
          <article>
            <strong>{overview.summary.pendingCandidates}</strong>
            <span>Sugestões para revisar</span>
          </article>
          <article>
            <strong>{overview.summary.pendingDecisions}</strong>
            <span>Análises pendentes</span>
          </article>
          <article>
            <strong>{overview.summary.pendingProposals}</strong>
            <span>Atualizações sugeridas</span>
          </article>
        </section>

        <details className={styles.filters}>
          <summary>Filtros dos padrões</summary>
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
              <h2>Padrões ativos</h2>
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
                    {profile.description || "Padrão aprovado para esta câmera."}
                  </p>
                  <div className={styles.profileStats}>
                    <span>
                      <strong>{confidencePercent(profile.confidence)}</strong>{" "}
                      confiança
                    </span>
                    <span>
                      <strong>{profile.observationCount}</strong> observações
                    </span>
                    <span>
                      <strong>{profile.distinctDaysCount}</strong> dias
                    </span>
                    <span>
                      <strong>v{profile.version}</strong> revisão
                    </span>
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Locais habituais</strong>
                    {tags(profile.habitualZoneNames)}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Ações recorrentes</strong>
                    {tags(profile.habitualActionCodes, actionCodeLabel)}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Tipos de período</strong>
                    {tags(profile.habitualSessionTypes, sessionTypeLabel)}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Dias observados</strong>
                    {tags(profile.habitualWeekdays.map(String), (value) =>
                      weekdayLabel(Number(value)),
                    )}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Faixas de turno</strong>
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
                        Ainda sem turno estável
                      </span>
                    )}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Características visuais recorrentes</strong>
                    {tags(profile.recurringAppearanceSummary)}
                  </div>
                  <footer>
                    <span>
                      {profile.lastObservedAt
                        ? `Última observação: ${new Date(profile.lastObservedAt).toLocaleString("pt-BR")}`
                        : "Sem observação recente"}
                    </span>
                    {profile.pendingProposalCount ? (
                      <strong>
                        {profile.pendingProposalCount} atualização pendente
                      </strong>
                    ) : null}
                  </footer>
                  {canManage ? (
                    <details className={styles.editor}>
                      <summary>Editar padrão</summary>
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
                          Rótulo
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
                          Atualização
                          <select
                            name="update_mode"
                            defaultValue={profile.updateMode}
                          >
                            <option value="manual">Somente manual</option>
                            <option value="reviewed_learning">
                              Aprendizado com revisão
                            </option>
                          </select>
                        </label>
                        <label>
                          Semelhança mínima
                          <input
                            type="number"
                            name="min_similarity"
                            min="0.5"
                            max="1"
                            step="0.01"
                            defaultValue={profile.minSimilarity}
                          />
                        </label>
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
                Nenhum padrão da operação encontrado.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>REVISÃO HUMANA</span>
              <h2>Novos padrões sugeridos</h2>
            </div>
          </div>
          <div className={styles.reviewList}>
            {overview.candidates.length ? (
              overview.candidates.map((candidate) => (
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
                    {candidate.observationCount} observações em{" "}
                    {candidate.distinctDaysCount} dias · confiança{" "}
                    {confidencePercent(candidate.confidence)}.
                  </p>
                  {tags(candidate.zoneNames)}
                  {tags(candidate.actionCodes, actionCodeLabel)}
                  {tags(candidate.appearanceSummary)}
                  <div className={styles.evidenceLinks}>
                    {candidate.evidenceEventIds.slice(0, 4).map((eventId) => (
                      <Link key={eventId} href={`/dashboard/events/${eventId}`}>
                        Evidência
                      </Link>
                    ))}
                  </div>
                  {canManage ? (
                    <form
                      action={reviewStaffCandidateAction}
                      className={styles.reviewForm}
                    >
                      <input
                        type="hidden"
                        name="candidate_id"
                        value={candidate.id}
                      />
                      <label>
                        Rótulo
                        <input
                          name="label"
                          defaultValue={candidate.suggestedLabel}
                          maxLength={120}
                        />
                      </label>
                      <label>
                        Descrição
                        <textarea name="description" maxLength={600} />
                      </label>
                      <label>
                        Semelhança mínima
                        <input
                          type="number"
                          name="min_similarity"
                          min="0.5"
                          max="1"
                          step="0.01"
                          defaultValue="0.74"
                        />
                      </label>
                      <label>
                        Observação
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
                          Continuar aprendendo
                        </button>
                        <button
                          className={styles.danger}
                          name="action"
                          value="reject"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                Nenhuma sugestão aguardando revisão.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>ANÁLISES PENDENTES</span>
              <h2>Situações que precisam de revisão</h2>
            </div>
          </div>
          <div className={styles.reviewList}>
            {overview.decisions.length ? (
              overview.decisions.map((decision) => (
                <article className={styles.reviewCard} key={decision.id}>
                  <header>
                    <div>
                      <span>{decision.cameraName}</span>
                      <h3>{staffDecisionLabel(decision.decision)}</h3>
                    </div>
                    <strong>{confidencePercent(decision.totalScore)}</strong>
                  </header>
                  <p>
                    {decision.staffProfileLabel
                      ? `Padrão sugerido: ${decision.staffProfileLabel}.`
                      : "Nenhum padrão aprovado atingiu certeza suficiente."}
                  </p>
                  <div className={styles.scoreGrid}>
                    <span>
                      Aparência {confidencePercent(decision.appearanceScore)}
                    </span>
                    <span>Zona {confidencePercent(decision.zoneScore)}</span>
                    <span>Ação {confidencePercent(decision.actionScore)}</span>
                    <span>
                      Horário {confidencePercent(decision.scheduleScore)}
                    </span>
                  </div>
                  <ul>
                    {decision.reasons.slice(0, 6).map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <Link href={`/dashboard/events/${decision.eventId}`}>
                    Abrir evidência
                  </Link>
                  {canManage ? (
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
                          <option value="">Sem padrão</option>
                          {overview.profiles
                            .filter(
                              (profile) =>
                                profile.cameraId === decision.cameraId,
                            )
                            .map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label>
                        Observação
                        <textarea name="notes" maxLength={600} />
                      </label>
                      <div>
                        <button name="verdict" value="confirm">
                          Confirmar
                        </button>
                        <button
                          className={styles.secondary}
                          name="verdict"
                          value="reassign"
                        >
                          Associar
                        </button>
                        <button
                          className={styles.secondary}
                          name="verdict"
                          value="uncertain"
                        >
                          Manter incerto
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
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                Nenhuma correspondência aguardando revisão.
              </div>
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <span>APRENDIZADO CONTROLADO</span>
              <h2>Atualizações propostas</h2>
            </div>
          </div>
          <div className={styles.reviewList}>
            {overview.proposals.length ? (
              overview.proposals.map((proposal) => (
                <article className={styles.reviewCard} key={proposal.id}>
                  <header>
                    <div>
                      <span>{proposal.cameraName}</span>
                      <h3>{proposal.staffProfileLabel}</h3>
                    </div>
                    <strong>{confidencePercent(proposal.confidence)}</strong>
                  </header>
                  <p>{proposal.reason}</p>
                  <div className={styles.profileSection}>
                    <strong>Zonas sugeridas</strong>
                    {tags(proposal.proposedZoneNames)}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Ações sugeridas</strong>
                    {tags(proposal.proposedActionCodes, actionCodeLabel)}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Turnos sugeridos</strong>
                    {proposal.proposedShiftWindows.length ? (
                      <ul>
                        {proposal.proposedShiftWindows.map((window) => (
                          <li key={`${window.weekday}-${window.startMinute}`}>
                            {shiftWindowLabel(window)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className={styles.muted}>Sem mudança de turno</span>
                    )}
                  </div>
                  <div className={styles.profileSection}>
                    <strong>Descritores sugeridos</strong>
                    {tags(proposal.proposedAppearanceSummary)}
                  </div>
                  {canManage ? (
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
                        Observação
                        <textarea name="notes" maxLength={600} />
                      </label>
                      <div>
                        <button name="action" value="apply">
                          Aplicar como nova versão
                        </button>
                        <button
                          className={styles.danger}
                          name="action"
                          value="reject"
                        >
                          Rejeitar
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                Nenhuma atualização aguardando aprovação.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
