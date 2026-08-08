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
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
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

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

function durationLabel(startedAt: string, endedAt: string) {
  const seconds = Math.max(
    0,
    (new Date(endedAt).getTime() -
      new Date(startedAt).getTime()) /
      1000,
  );

  if (seconds < 60) return `${Math.round(seconds)} segundos`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);

  return remainder
    ? `${minutes} min ${remainder} s`
    : `${minutes} minutos`;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function frameLabel(value: string) {
  const labels: Record<string, string> = {
    start: "Início",
    peak: "Pico",
    end: "Fim",
    extra: "Intermediário",
  };

  return labels[value] ?? value;
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
    framesObserved: "Frames observados",
    configuredStartThreshold: "Limiar inicial configurado",
    configuredContinueThreshold: "Limiar de continuação configurado",
    effectiveStartThreshold: "Limiar inicial efetivo",
    effectiveContinueThreshold: "Limiar de continuação efetivo",
    noiseP50Percent: "Ruído p50",
    noiseP90Percent: "Ruído p90",
    noiseP95Percent: "Ruído p95",
    ignoredPixelPercent: "Área ignorada",
    autoIgnoredCellCount: "Células automáticas ignoradas",
    startConsecutiveFrames: "Frames para iniciar",
    endConsecutiveFrames: "Frames para encerrar",
    cooldownSeconds: "Cooldown",
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

  /*
   * Modelo de IA e custo em dólar são informação interna da BigCorps.
   * Exibi-los ao cliente entrega a estrutura de custo por evento — com o
   * volume mensal dele, dá para calcular a margem exata do plano. Latência
   * e contagem de evidências continuam visíveis: são úteis para o cliente
   * e não revelam nada nosso.
   */
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
              EVENTO · {event.cameraName.toUpperCase()}
            </span>
            <h1>{event.headline}</h1>
            <p>
              {formatDate(event.startedAt, event.timezone)} ·{" "}
              {durationLabel(event.startedAt, event.endedAt)}
            </p>
          </div>

          <Link
            href={listHref}
            className="back-link"
          >
            ← Voltar aos eventos
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
            Avaliação salva.
          </div>
        ) : null}

        {scalar(rawSearchParams.updated) === "1" ? (
          <div className={styles.success}>
            Revisão atualizada.
          </div>
        ) : null}

        {scalar(rawSearchParams.review_deleted) === "1" ? (
          <div className={styles.success}>
            Revisão excluída. O estado atual foi recalculado pelo
            histórico restante.
          </div>
        ) : null}

        <section className={styles.hero}>
          <div>
            <span>RESUMO DA IA</span>
            <h2>{event.summary}</h2>

            <div className={styles.heroMeta}>
              <span>{eventTypeLabel(event.eventType)}</span>
              <span>{event.siteName}</span>
              <span>{event.cameraName}</span>
              <span>{percent(event.confidence)} de confiança</span>
              <span>
                {reviewLabel(
                  event.humanVerdict ?? event.reviewStatus,
                )}
              </span>
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
                <dt>Clipe</dt>
                <dd>{clipAsset ? "Sim" : "—"}</dd>
              </div>
            </dl>
          </aside>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span>EVIDÊNCIAS VISUAIS</span>
              <h2>Imagens e clipe do acontecimento</h2>
            </div>
            <small>
              {imageAssets.length}/{expectedEvidenceCount} imagens preservadas
              {clipAsset ? " · clipe disponível" : ""}
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
                <span>SEQUÊNCIA</span>
                <h2>Observações</h2>
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
                        <small>
                          {percent(observation.confidence)}
                        </small>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            ) : (
              <div className={styles.emptyBlock}>
                Nenhuma observação estruturada.
              </div>
            )}
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>ENTIDADES</span>
                <h2>Pessoas e veículos</h2>
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
                        <span>
                          Papel operacional: {personRoleLabel(person.role)} ·{" "}
                          {Math.round(person.roleConfidence * 100)}%
                        </span>
                        <span>
                          Parte superior:{" "}
                          {person.upperClothingColor ??
                            "não visível"}
                        </span>
                        <span>
                          Parte inferior:{" "}
                          {person.lowerClothingColor ??
                            "não visível"}
                        </span>
                        {person.carrying.length ? (
                          <span>
                            Carregando:{" "}
                            {person.carrying.join(", ")}
                          </span>
                        ) : null}
                        {person.accessories.length ? (
                          <span>
                            Acessórios:{" "}
                            {person.accessories.join(", ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhuma pessoa estruturada.</p>
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
                        <span>
                          Cor: {vehicle.color ?? "não visível"}
                        </span>
                        <span>
                          Confiança:{" "}
                          {percent(vehicle.confidence)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Nenhum veículo estruturado.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <div>
              <span>OBJETOS E TAGS</span>
              <h2>Elementos pesquisáveis</h2>
            </div>
          </div>

          <div className={styles.objectGrid}>
            {event.objects.map((object, index) => (
              <article key={`${object.localTrackId}-${index}`}>
                <strong>{object.label}</strong>
                <span>
                  Estado: {objectStateLabel(object.state)}
                </span>
                <span>
                  Cor: {object.color ?? "não visível"}
                </span>
                <small>{percent(object.confidence)}</small>
              </article>
            ))}
          </div>

          {event.tags.length ? (
            <div className={styles.tags}>
              {event.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </section>

        <div className={styles.twoColumns}>
          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>REVISÃO HUMANA</span>
                <h2>
                  {currentReview
                    ? "Edite a avaliação atual"
                    : "Avalie este evento"}
                </h2>
              </div>
            </div>

            {event.reviewReasons.length ? (
              <div className={styles.reviewReasons}>
                <strong>Motivos sugeridos pela IA</strong>
                <ul>
                  {event.reviewReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form
              action={reviewEventAction}
              className={styles.reviewForm}
            >
              <input
                type="hidden"
                name="event_id"
                value={event.id}
              />
              <input
                type="hidden"
                name="detail_query"
                value={detailQuery}
              />
              {currentReview ? (
                <input
                  type="hidden"
                  name="review_id"
                  value={currentReview.id}
                />
              ) : null}

              <label>
                <span>Avaliação</span>
                <select
                  name="verdict"
                  defaultValue={
                    currentReview?.verdict ??
                    event.humanVerdict ??
                    "useful"
                  }
                  required
                >
                  <option value="useful">
                    Útil e corretamente classificado
                  </option>
                  <option value="irrelevant">
                    Irrelevante para a operação
                  </option>
                  <option value="incorrect">
                    Classificação incorreta
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Tipo correto, caso marque classificação incorreta
                </span>
                <select
                  name="corrected_event_type"
                  defaultValue={
                    currentReview?.correctedEventType ??
                    event.correctedEventType ??
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
                <span>Observações opcionais</span>
                <textarea
                  name="notes"
                  maxLength={2000}
                  defaultValue={
                    currentReview?.notes ?? event.reviewNotes
                  }
                  placeholder="Explique por que o evento é útil, irrelevante ou está classificado incorretamente."
                />
              </label>

              <button type="submit">
                {currentReview
                  ? "Atualizar avaliação"
                  : "Salvar avaliação"}
              </button>
            </form>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHeading}>
              <div>
                <span>HISTÓRICO</span>
                <h2>Revisões anteriores</h2>
              </div>
            </div>

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
                          ? `Editada em ${formatDate(
                              review.updatedAt,
                              event.timezone,
                            )}`
                          : formatDate(
                              review.createdAt,
                              event.timezone,
                            )}
                      </time>
                    </div>

                    {review.correctedEventType ? (
                      <span>
                        Tipo correto:{" "}
                        {eventTypeLabel(
                          review.correctedEventType,
                        )}
                      </span>
                    ) : null}

                    {review.notes ? (
                      <p>{review.notes}</p>
                    ) : null}

                    <details className={styles.reviewEditor}>
                      <summary>Editar revisão</summary>
                      <form
                        action={reviewEventAction}
                        className={styles.reviewForm}
                      >
                        <input
                          type="hidden"
                          name="event_id"
                          value={event.id}
                        />
                        <input
                          type="hidden"
                          name="review_id"
                          value={review.id}
                        />
                        <input
                          type="hidden"
                          name="detail_query"
                          value={detailQuery}
                        />

                        <label>
                          <span>Avaliação</span>
                          <select
                            name="verdict"
                            defaultValue={review.verdict}
                            required
                          >
                            <option value="useful">
                              Útil e corretamente classificado
                            </option>
                            <option value="irrelevant">
                              Irrelevante para a operação
                            </option>
                            <option value="incorrect">
                              Classificação incorreta
                            </option>
                          </select>
                        </label>

                        <label>
                          <span>Tipo correto</span>
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
                          <span>Observações</span>
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
                Este evento ainda não foi revisado.
              </div>
            )}
          </section>
        </div>

        <EventNavigationBar
          navigation={navigation}
          detailQuery={detailQuery}
          listHref={listHref}
          page={contextPage}
        />

        <section className={styles.section}>
          <details className={styles.technical}>
            <summary>
              {isInternal
                ? "Dados técnicos e custo"
                : "Dados técnicos"}
            </summary>

            <div className={styles.technicalGrid}>
              <div>
                <h3>Análise</h3>
                <dl>
                  {isInternal ? (
                    <div>
                      <dt>Modelo final</dt>
                      <dd>{event.model ?? "—"}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Modo</dt>
                    <dd>
                      {event.analysisPlanCode ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Evidências enviadas</dt>
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
                    <dt>Latência</dt>
                    <dd>
                      {event.latencyMs === null
                        ? "—"
                        : `${(
                            event.latencyMs / 1000
                          ).toFixed(1)}s`}
                    </dd>
                  </div>
                  {isInternal ? (
                    <div>
                      <dt>Custo total</dt>
                      <dd>
                        US${" "}
                        {totalCostUsd.toFixed(6)}
                      </dd>
                    </div>
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
                        <dd>
                          {localMetricValue(key, value)}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </div>
            </div>
          </details>
        </section>

        {canDelete ? (
          <section className={styles.danger}>
            <div>
              <strong>Remover da linha do tempo</strong>
              <p>
                A exclusão é lógica e fica registrada na auditoria.
                Os arquivos seguem a política de retenção.
              </p>
            </div>

            <form action={deleteEventAction}>
              <input
                type="hidden"
                name="event_id"
                value={event.id}
              />
              <button type="submit">Excluir evento</button>
            </form>
          </section>
        ) : null}
      </section>
    </main>
  );
}
