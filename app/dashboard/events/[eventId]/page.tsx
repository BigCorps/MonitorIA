import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
} from "@/src/lib/dashboard-data";
import { getEventDetail } from "@/src/lib/event-search-data";
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

  const event = await getEventDetail(
    organization.id,
    eventId,
  );

  if (!event) notFound();

  const canDelete = ["owner", "admin"].includes(
    organization.role,
  );

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
            href="/dashboard/events"
            className="back-link"
          >
            ← Voltar aos eventos
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />

        {scalar(rawSearchParams.saved) === "1" ? (
          <div className={styles.success}>
            Avaliação salva e adicionada ao histórico.
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
                <h2>Avalie este evento</h2>
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

              <label>
                <span>Avaliação</span>
                <select
                  name="verdict"
                  defaultValue={
                    event.humanVerdict ?? "useful"
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
                    event.correctedEventType ?? event.eventType
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
                  defaultValue={event.reviewNotes}
                  placeholder="Explique por que o evento é útil, irrelevante ou está classificado incorretamente."
                />
              </label>

              <button type="submit">
                Salvar avaliação
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
                {event.reviews.map((review) => (
                  <article key={review.id}>
                    <div>
                      <strong>
                        {reviewLabel(review.verdict)}
                      </strong>
                      <time>
                        {formatDate(
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

        <section className={styles.section}>
          <details className={styles.technical}>
            <summary>Dados técnicos e custo</summary>

            <div className={styles.technicalGrid}>
              <div>
                <h3>Análise</h3>
                <dl>
                  <div>
                    <dt>Modelo final</dt>
                    <dd>{event.model ?? "—"}</dd>
                  </div>
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
                  <div>
                    <dt>Custo total</dt>
                    <dd>
                      US${" "}
                      {totalCostUsd.toFixed(6)}
                    </dd>
                  </div>
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
