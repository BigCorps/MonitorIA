import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { isInternalOperatorEmail } from "@/src/lib/internal-operator";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  addDaysToDateOnly,
  dateOnlyToIso,
  getEventDetail,
  getEventNavigation,
  siteTimezone,
  type EventNavigation,
} from "@/src/lib/event-search-data";
import {
  EVENT_TYPE_OPTIONS,
  eventTypeLabel,
  personRoleLabel,
  reviewLabel,
} from "@/src/lib/event-labels";
import {
  formatMonitoringDateTime,
  formatMonitoringDuration,
  monitoringConfidenceLabel,
} from "@/src/lib/monitoring-display";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { MonitoringAnalysisDetails } from "../../monitoring-analysis-details";
import { expectedLongTermEvidenceCount } from "@/src/clips/policy";
import { EventMedia } from "./event-media";
import {
  deleteEventAction,
  reviewEventAction,
} from "../actions";
import { ReviewDeleteForm } from "./review-delete-form";
import styles from "./event-detail.module.css";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
};

function scalar(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const DETAIL_QUERY_KEYS = [
  "from",
  "to",
  "site",
  "camera",
  "type",
  "review",
  "page",
] as const;

function detailContext(
  raw: Record<string, string | string[] | undefined>,
) {
  const params = new URLSearchParams();

  for (const key of DETAIL_QUERY_KEYS) {
    const value = scalar(raw[key]).slice(0, 160);
    if (value) params.set(key, value);
  }

  return params;
}

function navigationHref(
  eventId: string,
  query: string,
) {
  return `/dashboard/events/${eventId}${query ? `?${query}` : ""}`;
}

function EventNavigationBar({
  navigation,
  detailQuery,
  listHref,
  page,
}: {
  navigation: EventNavigation;
  detailQuery: string;
  listHref: string;
  page: number;
}) {
  return (
    <nav
      className={styles.eventNavigation}
      aria-label="Navegação entre acontecimentos"
    >
      {navigation.previous ? (
        <Link
          href={navigationHref(
            navigation.previous.id,
            detailQuery,
          )}
          className={styles.eventNavigationItem}
        >
          <span>← Anterior</span>
          <strong>{navigation.previous.headline}</strong>
        </Link>
      ) : (
        <span
          className={`${styles.eventNavigationItem} ${styles.eventNavigationDisabled}`}
        >
          <span>← Anterior</span>
          <strong>Início da seleção</strong>
        </span>
      )}

      <Link
        href={listHref}
        className={styles.eventNavigationBack}
      >
        Voltar à página {page}
      </Link>

      {navigation.next ? (
        <Link
          href={navigationHref(
            navigation.next.id,
            detailQuery,
          )}
          className={`${styles.eventNavigationItem} ${styles.eventNavigationNext}`}
        >
          <span>Próximo →</span>
          <strong>{navigation.next.headline}</strong>
        </Link>
      ) : (
        <span
          className={`${styles.eventNavigationItem} ${styles.eventNavigationNext} ${styles.eventNavigationDisabled}`}
        >
          <span>Próximo →</span>
          <strong>Fim da seleção</strong>
        </span>
      )}
    </nav>
  );
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function objectStateLabel(value: string) {
  const labels: Record<string, string> = {
    appeared: "Apareceu",
    removed: "Removido",
    moved: "Movido",
    present: "Presente",
    unknown: "Indeterminado",
  };

  return labels[value] ?? value;
}

function localMetricLabel(key: string) {
  const labels: Record<string, string> = {
    planCode: "Modo",
    peakMotionPercent: "Pico de movimento",
    meanMotionPercent: "Movimento médio",
    rawPeakMotionPercent: "Pico bruto",
    durationSeconds: "Duração local",
    framesObserved: "Imagens observadas",
    configuredStartThreshold: "Limiar inicial configurado",
    configuredContinueThreshold: "Limiar de continuação configurado",
    effectiveStartThreshold: "Limiar inicial efetivo",
    effectiveContinueThreshold: "Limiar de continuação efetivo",
    noiseP50Percent: "Ruído p50",
    noiseP90Percent: "Ruído p90",
    noiseP95Percent: "Ruído p95",
    ignoredPixelPercent: "Área ignorada",
    autoIgnoredCellCount: "Células automáticas ignoradas",
    startConsecutiveFrames: "Imagens para iniciar",
    endConsecutiveFrames: "Imagens para encerrar",
    cooldownSeconds: "Intervalo de segurança",
    closeReason: "Motivo do encerramento",
  };

  return labels[key] ?? key;
}

function localMetricValue(key: string, value: unknown) {
  if (
    key.toLowerCase().includes("percent") &&
    Number.isFinite(Number(value))
  ) {
    return `${Number(value).toFixed(2)}%`;
  }

  if (key === "durationSeconds" || key === "cooldownSeconds") {
    return `${Number(value).toFixed(1)}s`;
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function reviewStateLabel(value: string | null) {
  if (value === "useful") return "Confirmada como correta";
  if (value === "irrelevant") return "Marcada como irrelevante";
  if (value === "incorrect") return "Classificação corrigida";
  return null;
}

function hiddenReviewFields(
  eventId: string,
  detailQuery: string,
  reviewId?: string | null,
) {
  return (
    <>
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="detail_query" value={detailQuery} />
      {reviewId ? (
        <input type="hidden" name="review_id" value={reviewId} />
      ) : null}
    </>
  );
}

export default async function EventDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ eventId }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);

  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [event, sites] = await Promise.all([
    getEventDetail(organization.id, eventId),
    getOrganizationSites(organization.id),
  ]);

  if (!event) notFound();

  const contextParams = detailContext(rawSearchParams);
  const detailQuery = contextParams.toString();
  const listHref = `/dashboard/events${
    detailQuery ? `?${detailQuery}` : ""
  }`;
  const contextPage = Math.max(
    1,
    Number.parseInt(contextParams.get("page") ?? "1", 10) || 1,
  );
  const navigationTimeZone = siteTimezone(
    sites,
    contextParams.get("site"),
  );
  const toDate = contextParams.get("to");
  const navigation = await getEventNavigation(organization.id, {
    startedAt: event.startedAt,
    from: dateOnlyToIso(
      contextParams.get("from"),
      navigationTimeZone,
    ),
    to: toDate
      ? dateOnlyToIso(
          addDaysToDateOnly(toDate, 1),
          navigationTimeZone,
        )
      : null,
    cameraId: contextParams.get("camera"),
    siteId: contextParams.get("site"),
    eventType: contextParams.get("type"),
    reviewFilter: contextParams.get("review"),
  });

  const canDelete = ["owner", "admin"].includes(
    organization.role,
  );
  const isInternal = isInternalOperatorEmail(user.email);

  const totalCostUsd = event.usage.reduce(
    (total, item) =>
      total + Number(item.estimatedCostUsd ?? 0),
    0,
  );
  const imageAssets = event.assets.filter(
    (asset) => asset.kind !== "preserved_clip",
  );
  const clipAsset =
    event.assets.find(
      (asset) => asset.kind === "preserved_clip",
    ) ?? null;
  const expectedEvidenceCount =
    expectedLongTermEvidenceCount(event.analysisPlanCode);
  const currentReview = event.reviews[0] ?? null;
  const visibleReviewState = reviewStateLabel(event.humanVerdict);

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="events"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              ACONTECIMENTO · {event.cameraName.toUpperCase()}
            </span>
            <h1>{event.headline}</h1>
            <p>
              {formatMonitoringDateTime(event.startedAt, event.timezone)} ·{" "}
              {formatMonitoringDuration(
                Math.max(
                  0,
                  (new Date(event.endedAt).getTime() -
                    new Date(event.startedAt).getTime()) /
                    1000,
                ),
              )}
            </p>
          </div>

          <Link href={listHref} className="back-link">
            ← Voltar aos acontecimentos
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />

        <EventNavigationBar
          navigation={navigation}
          detailQuery={detailQuery}
          listHref={listHref}
          page={contextPage}
        />

        {scalar(rawSearchParams.saved) === "1" ? (
          <div className={styles.success}>
            Avaliação salva. Este acontecimento já foi atualizado.
          </div>
        ) : null}

        {scalar(rawSearchParams.updated) === "1" ? (
          <div className={styles.success}>
            Avaliação atualizada.
          </div>
        ) : null}

        {scalar(rawSearchParams.review_deleted) === "1" ? (
          <div className={styles.success}>
            Avaliação removida. O estado anterior foi restaurado quando
            havia outra avaliação no histórico.
          </div>
        ) : null}

        <section className={styles.hero}>
          <div>
            <span>RESUMO</span>
            <h2>{event.summary}</h2>

            <div className={styles.heroMeta}>
              <span>{eventTypeLabel(event.eventType)}</span>
              <span>{event.siteName}</span>
              <span>{event.cameraName}</span>
              {visibleReviewState ? (
                <span data-review={event.humanVerdict}>
                  {visibleReviewState}
                </span>
              ) : event.requiresReview ? (
                <span data-review="pending">
                  Revisão recomendada
                </span>
              ) : null}
            </div>
          </div>

          <aside>
            <dl>
              <div>
                <dt>Pessoas</dt>
                <dd>{event.people.length}</dd>
              </div>
              <div>
                <dt>Veículos</dt>
                <dd>{event.vehicles.length}</dd>
              </div>
              <div>
                <dt>Imagens</dt>
                <dd>{imageAssets.length}</dd>
              </div>
              <div>
                <dt>Vídeo</dt>
                <dd>{clipAsset ? "Sim" : "—"}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span>REGISTROS VISUAIS</span>
              <h2>Imagens e vídeo</h2>
            </div>
            <small>
              {imageAssets.length} imagem
              {imageAssets.length === 1 ? "" : "s"}
              {clipAsset ? " · vídeo disponível" : ""}
            </small>
          </div>

          <EventMedia
            invoiceSafeTitle={event.headline}
            images={imageAssets.map((asset) => ({
              id: asset.id,
              label: asset.label,
              capturedAt: asset.capturedAt,
            }))}
            clip={
              clipAsset
                ? {
                    id: clipAsset.id,
                    byteSize: clipAsset.byteSize,
                  }
                : null
            }
            expectedEvidenceCount={expectedEvidenceCount}
            timezone={event.timezone}
          />
        </section>

        <div className={styles.twoColumns}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>O QUE ACONTECEU</span>
                <h2>Sequência observada</h2>
              </div>
            </div>

            {event.observations.length ? (
              <ol className={styles.timeline}>
                {event.observations.map(
                  (observation, index) => (
                    <li key={`${observation.offsetSeconds}-${index}`}>
                      <time>
                        +{observation.offsetSeconds.toFixed(1)}s
                      </time>
                      <div>
                        <strong>
                          {eventTypeLabel(observation.type)}
                        </strong>
                        <p>{observation.description}</p>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <div className={styles.emptyBlock}>
                Não há uma sequência detalhada para este acontecimento.
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>PESSOAS E VEÍCULOS</span>
                <h2>Quem ou o que apareceu</h2>
              </div>
            </div>

            <div className={styles.entityGroups}>
              <div>
                <h3>Pessoas ({event.people.length})</h3>
                {event.people.length ? (
                  <ul>
                    {event.people.map((person, index) => (
                      <li key={person.id}>
                        <strong>
                          {personRoleLabel(person.role)} {index + 1}
                        </strong>
                        {person.upperClothingColor ? (
                          <span>
                            Parte superior: {person.upperClothingColor}
                          </span>
                        ) : null}
                        {person.lowerClothingColor ? (
                          <span>
                            Parte inferior: {person.lowerClothingColor}
                          </span>
                        ) : null}
                        {person.carrying.length ? (
                          <span>
                            Carregando: {person.carrying.join(", ")}
                          </span>
                        ) : null}
                        {person.accessories.length ? (
                          <span>
                            Acessórios: {person.accessories.join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma pessoa registrada.</p>
                )}
              </div>

              <div>
                <h3>Veículos ({event.vehicles.length})</h3>
                {event.vehicles.length ? (
                  <ul>
                    {event.vehicles.map((vehicle, index) => (
                      <li key={vehicle.id}>
                        <strong>Veículo {index + 1}</strong>
                        <span>Tipo: {vehicle.type}</span>
                        {vehicle.color ? (
                          <span>Cor: {vehicle.color}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhum veículo registrado.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        {event.objects.length ? (
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>OBJETOS</span>
                <h2>Objetos observados</h2>
              </div>
            </div>

            <div className={styles.objectGrid}>
              {event.objects.map((object, index) => (
                <article key={`${object.localTrackId}-${index}`}>
                  <strong>{object.label}</strong>
                  <span>
                    {objectStateLabel(object.state)}
                  </span>
                  {object.color ? (
                    <span>Cor: {object.color}</span>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={`${styles.section} ${styles.reviewSection}`}>
          <div className={styles.reviewIntro}>
            <div>
              <span>SUA AVALIAÇÃO</span>
              <h2>Essa análise está correta?</h2>
              <p>
                Sua resposta corrige este acontecimento imediatamente.
                Correções semelhantes podem gerar uma sugestão de
                refinamento no futuro, mas o MonitorIA não muda regras
                sozinho.
              </p>
            </div>
            {visibleReviewState ? (
              <strong data-review={event.humanVerdict}>
                {visibleReviewState}
              </strong>
            ) : null}
          </div>

          <div className={styles.reviewActions}>
            <form action={reviewEventAction}>
              {hiddenReviewFields(
                event.id,
                detailQuery,
                currentReview?.id,
              )}
              <input type="hidden" name="verdict" value="useful" />
              <button
                className={styles.reviewButtonPrimary}
                type="submit"
              >
                Sim, está correta
              </button>
            </form>

            <form action={reviewEventAction}>
              {hiddenReviewFields(
                event.id,
                detailQuery,
                currentReview?.id,
              )}
              <input type="hidden" name="verdict" value="irrelevant" />
              <button
                className={styles.reviewButtonSecondary}
                type="submit"
              >
                Não é relevante
              </button>
            </form>

            <details className={styles.correctionDisclosure}>
              <summary>Está classificado errado</summary>
              <form
                action={reviewEventAction}
                className={styles.reviewForm}
              >
                {hiddenReviewFields(
                  event.id,
                  detailQuery,
                  currentReview?.id,
                )}
                <input type="hidden" name="verdict" value="incorrect" />

                <label>
                  <span>Qual é a classificação correta?</span>
                  <select
                    name="corrected_event_type"
                    defaultValue={
                      currentReview?.correctedEventType ??
                      event.correctedEventType ??
                      event.eventType
                    }
                    required
                  >
                    {EVENT_TYPE_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Observação opcional</span>
                  <textarea
                    name="notes"
                    maxLength={2000}
                    defaultValue={currentReview?.notes ?? ""}
                    placeholder="Se quiser, explique o que deveria ter sido entendido."
                  />
                </label>

                <button type="submit">Salvar correção</button>
              </form>
            </details>
          </div>

          <small className={styles.learningNote}>
            O aprendizado é supervisionado: uma correção isolada nunca
            altera automaticamente as próximas análises.
          </small>
        </section>

        <EventNavigationBar
          navigation={navigation}
          detailQuery={detailQuery}
          listHref={listHref}
          page={contextPage}
        />

        <section className={styles.analysisDetailsWrap}>
          <MonitoringAnalysisDetails
            title="Detalhes da análise"
            description="Confiança, métricas, histórico de avaliações e opções administrativas."
          >
            <div className={styles.technicalGrid}>
              <div>
                <h3>Análise</h3>
                <dl>
                  <div>
                    <dt>Certeza geral</dt>
                    <dd>
                      {monitoringConfidenceLabel(event.confidence)} ·{" "}
                      {percent(event.confidence)}
                    </dd>
                  </div>
                  <div>
                    <dt>Classificação original</dt>
                    <dd>{eventTypeLabel(event.originalEventType)}</dd>
                  </div>
                  <div>
                    <dt>Classificação usada</dt>
                    <dd>{eventTypeLabel(event.eventType)}</dd>
                  </div>
                  <div>
                    <dt>Estado da avaliação</dt>
                    <dd>
                      {reviewLabel(
                        event.humanVerdict ?? event.reviewStatus,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Modo de análise</dt>
                    <dd>{event.analysisPlanCode ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Imagens analisadas</dt>
                    <dd>
                      {String(
                        event.localMetrics.submittedFrameCount ??
                          imageAssets.length,
                      )}
                      {" / "}
                      {String(
                        event.localMetrics.sourceFrameCount ??
                          imageAssets.length,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Tempo de processamento</dt>
                    <dd>
                      {event.latencyMs === null
                        ? "—"
                        : `${(event.latencyMs / 1000).toFixed(1)}s`}
                    </dd>
                  </div>
                  {isInternal ? (
                    <>
                      <div>
                        <dt>Modelo final</dt>
                        <dd>{event.model ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>Custo total</dt>
                        <dd>US$ {totalCostUsd.toFixed(6)}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </div>

              <div>
                <h3>Métricas locais</h3>
                <dl>
                  {Object.entries(event.localMetrics).map(
                    ([key, value]) => (
                      <div key={key}>
                        <dt>{localMetricLabel(key)}</dt>
                        <dd>{localMetricValue(key, value)}</dd>
                      </div>
                    ),
                  )}
                </dl>
              </div>
            </div>

            {event.reviewReasons.length || event.tags.length ? (
              <div className={styles.technicalSubsection}>
                <h3>Informações adicionais</h3>
                {event.reviewReasons.length ? (
                  <div className={styles.reviewReasons}>
                    <strong>Por que a análise pediu revisão</strong>
                    <ul>
                      {event.reviewReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {event.tags.length ? (
                  <div className={styles.tags}>
                    {event.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={styles.technicalSubsection}>
              <h3>Histórico de avaliações</h3>
              {event.reviews.length ? (
                <div className={styles.reviewHistory}>
                  {event.reviews.map((review, index) => (
                    <article key={review.id}>
                      <div>
                        <strong>
                          {index === 0 ? "Atual · " : ""}
                          {reviewLabel(review.verdict)}
                        </strong>
                        <time>
                          {review.updatedAt !== review.createdAt
                            ? `Editada em ${formatMonitoringDateTime(
                                review.updatedAt,
                                event.timezone,
                              )}`
                            : formatMonitoringDateTime(
                                review.createdAt,
                                event.timezone,
                              )}
                        </time>
                      </div>

                      {review.correctedEventType ? (
                        <span>
                          Classificação correta:{" "}
                          {eventTypeLabel(review.correctedEventType)}
                        </span>
                      ) : null}

                      {review.notes ? <p>{review.notes}</p> : null}

                      <details className={styles.reviewEditor}>
                        <summary>Editar avaliação</summary>
                        <form
                          action={reviewEventAction}
                          className={styles.reviewForm}
                        >
                          {hiddenReviewFields(
                            event.id,
                            detailQuery,
                            review.id,
                          )}

                          <label>
                            <span>Avaliação</span>
                            <select
                              name="verdict"
                              defaultValue={review.verdict}
                              required
                            >
                              <option value="useful">
                                Correta
                              </option>
                              <option value="irrelevant">
                                Não é relevante
                              </option>
                              <option value="incorrect">
                                Classificação incorreta
                              </option>
                            </select>
                          </label>

                          <label>
                            <span>Classificação correta</span>
                            <select
                              name="corrected_event_type"
                              defaultValue={
                                review.correctedEventType ??
                                event.eventType
                              }
                            >
                              {EVENT_TYPE_OPTIONS.map((option) => (
                                <option
                                  key={option.value}
                                  value={option.value}
                                >
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label>
                            <span>Observação</span>
                            <textarea
                              name="notes"
                              maxLength={2000}
                              defaultValue={review.notes}
                            />
                          </label>

                          <button type="submit">
                            Salvar alterações
                          </button>
                        </form>

                        <ReviewDeleteForm
                          eventId={event.id}
                          reviewId={review.id}
                          detailQuery={detailQuery}
                        />
                      </details>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyBlock}>
                  Este acontecimento ainda não foi avaliado.
                </div>
              )}
            </div>

            {canDelete ? (
              <div className={styles.danger}>
                <div>
                  <strong>Remover da linha do tempo</strong>
                  <p>
                    A remoção fica registrada na auditoria e os arquivos
                    seguem a política de retenção da conta.
                  </p>
                </div>

                <form action={deleteEventAction}>
                  <input
                    type="hidden"
                    name="event_id"
                    value={event.id}
                  />
                  <button type="submit">
                    Excluir acontecimento
                  </button>
                </form>
              </div>
            ) : null}
          </MonitoringAnalysisDetails>
        </section>
      </section>
    </main>
  );
}
