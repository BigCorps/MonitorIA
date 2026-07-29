import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  addDaysToDateOnly,
  comparePeriods,
  dateOnlyToIso,
  searchEvents,
  siteTimezone,
} from "@/src/lib/event-search-data";
import {
  EVENT_TYPE_OPTIONS,
  eventTypeLabel,
  reviewLabel,
} from "@/src/lib/event-labels";
import type { EventExportInput } from "@/src/lib/event-export";
import { DashboardSidebar } from "../dashboard-sidebar";
import { EventList } from "../events/event-list";
import { ComparisonPanel } from "./comparison-panel";
import { ExportButtons } from "./export-buttons";
import styles from "./search.module.css";

export const metadata = { title: "Pesquisa" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function scalar(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function todayInZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function optionalBoolean(value: string) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return undefined;
}

function pageHref(
  current: Record<string, string>,
  page: number,
) {
  const params = new URLSearchParams(current);
  params.set("page", String(page));
  return `/dashboard/search?${params.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [sites, cameras, rawParams] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
    searchParams,
  ]);

  const query = scalar(rawParams.q);
  const siteId = scalar(rawParams.site);
  const cameraId = scalar(rawParams.camera);
  const eventType = scalar(rawParams.type);
  const review = scalar(rawParams.review) || "all";
  const people = scalar(rawParams.people);
  const vehicles = scalar(rawParams.vehicles);
  const timeZone = siteTimezone(sites, siteId);
  const today = todayInZone(timeZone);
  const defaultFrom = addDaysToDateOnly(today, -29);
  const fromDate = scalar(rawParams.from) || defaultFrom;
  const toDate = scalar(rawParams.to) || today;
  const confidenceText = scalar(rawParams.confidence);
  const minConfidence = confidenceText
    ? Number(confidenceText)
    : null;
  const page = Math.max(
    1,
    Number.parseInt(scalar(rawParams.page) || "1", 10) || 1,
  );
  const limit = 50;

  const result = await searchEvents(organization.id, {
    query,
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(
      addDaysToDateOnly(toDate, 1),
      timeZone,
    ),
    cameraId,
    siteId,
    eventType,
    minConfidence:
      minConfidence !== null &&
      Number.isFinite(minConfidence)
        ? minConfidence
        : null,
    reviewFilter: review,
    hasPeople: optionalBoolean(people),
    hasVehicles: optionalBoolean(vehicles),
    limit,
    offset: (page - 1) * limit,
  });

  const totalPages = Math.max(
    1,
    Math.ceil(result.total / limit),
  );

  const compareEnabled = scalar(rawParams.compare) === "1";
  const aFrom =
    scalar(rawParams.a_from) ||
    addDaysToDateOnly(today, -6);
  const aTo = scalar(rawParams.a_to) || today;
  const bFrom =
    scalar(rawParams.b_from) ||
    addDaysToDateOnly(today, -13);
  const bTo =
    scalar(rawParams.b_to) ||
    addDaysToDateOnly(today, -7);

  const comparison = compareEnabled
    ? await comparePeriods(organization.id, {
        fromA:
          dateOnlyToIso(aFrom, timeZone) ??
          new Date().toISOString(),
        toA:
          dateOnlyToIso(
            addDaysToDateOnly(aTo, 1),
            timeZone,
          ) ?? new Date().toISOString(),
        fromB:
          dateOnlyToIso(bFrom, timeZone) ??
          new Date().toISOString(),
        toB:
          dateOnlyToIso(
            addDaysToDateOnly(bTo, 1),
            timeZone,
          ) ?? new Date().toISOString(),
        cameraId,
        siteId,
      })
    : null;

  const exportInput: EventExportInput = {
    title: "Relatório de pesquisa MonitorIA",
    timeZone,
    filters: {
      "Texto pesquisado": query || null,
      "Data inicial": fromDate,
      "Data final": toDate,
      Local:
        sites.find((site) => site.id === siteId)?.name ??
        (siteId ? siteId : "Todos"),
      Câmera:
        cameras.find((camera) => camera.id === cameraId)
          ?.name ?? (cameraId ? cameraId : "Todas"),
      "Tipo de evento": eventType
        ? eventTypeLabel(eventType)
        : "Todos",
      "Confiança mínima":
        minConfidence === null
          ? null
          : `${Math.round(minConfidence * 100)}%`,
      Revisão: reviewLabel(review),
      Pessoas:
        people === "yes"
          ? "Com pessoas"
          : people === "no"
            ? "Sem pessoas"
            : "Qualquer",
      Veículos:
        vehicles === "yes"
          ? "Com veículos"
          : vehicles === "no"
            ? "Sem veículos"
            : "Qualquer",
    },
    total: result.total,
    events: result.rows.map((event) => ({
      id: event.id,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      cameraName: event.cameraName,
      siteName: event.siteName,
      eventType: event.eventType,
      eventTypeLabel: eventTypeLabel(event.eventType),
      summary: event.summary,
      confidence: event.confidence,
      requiresReview: event.requiresReview,
      humanVerdict: event.humanVerdict
        ? reviewLabel(event.humanVerdict)
        : null,
      peopleCount: event.peopleCount,
      vehicleCount: event.vehicleCount,
      tags: event.tags,
    })),
  };

  const preserved = {
    ...(query ? { q: query } : {}),
    from: fromDate,
    to: toDate,
    ...(siteId ? { site: siteId } : {}),
    ...(cameraId ? { camera: cameraId } : {}),
    ...(eventType ? { type: eventType } : {}),
    ...(confidenceText
      ? { confidence: confidenceText }
      : {}),
    ...(review !== "all" ? { review } : {}),
    ...(people ? { people } : {}),
    ...(vehicles ? { vehicles } : {}),
  };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="search"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PESQUISA · {organization.name.toUpperCase()}
            </span>
            <h1>Encontre acontecimentos</h1>
            <p>
              Pesquise em resumos, observações, roupas, objetos,
              veículos e tags sem consumir análises de IA.
            </p>
          </div>

          <Link
            href="/dashboard/events"
            className="panel-secondary-action"
          >
            Abrir linha do tempo
          </Link>
        </header>

        <form className={styles.searchForm} method="get">
          <label className={styles.queryField}>
            <span>O que deseja encontrar?</span>
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Ex.: pacote no balcão, pessoa de camisa preta, veículo prata..."
            />
          </label>

          <div className={styles.filterGrid}>
            <label>
              <span>De</span>
              <input
                type="date"
                name="from"
                defaultValue={fromDate}
              />
            </label>

            <label>
              <span>Até</span>
              <input
                type="date"
                name="to"
                defaultValue={toDate}
              />
            </label>

            <label>
              <span>Local</span>
              <select name="site" defaultValue={siteId}>
                <option value="">Todos</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Câmera</span>
              <select
                name="camera"
                defaultValue={cameraId}
              >
                <option value="">Todas</option>
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Tipo</span>
              <select name="type" defaultValue={eventType}>
                <option value="">Todos</option>
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
              <span>Confiança mínima</span>
              <select
                name="confidence"
                defaultValue={confidenceText}
              >
                <option value="">Qualquer</option>
                <option value="0.6">60%</option>
                <option value="0.75">75%</option>
                <option value="0.85">85%</option>
                <option value="0.95">95%</option>
              </select>
            </label>

            <label>
              <span>Revisão</span>
              <select name="review" defaultValue={review}>
                <option value="all">Todos</option>
                <option value="pending">Pendentes</option>
                <option value="required">
                  Exigem revisão
                </option>
                <option value="reviewed">
                  Já revisados
                </option>
                <option value="useful">Úteis</option>
                <option value="irrelevant">
                  Irrelevantes
                </option>
                <option value="incorrect">
                  Corrigidos
                </option>
              </select>
            </label>

            <label>
              <span>Pessoas</span>
              <select name="people" defaultValue={people}>
                <option value="">Qualquer</option>
                <option value="yes">Com pessoas</option>
                <option value="no">Sem pessoas</option>
              </select>
            </label>

            <label>
              <span>Veículos</span>
              <select
                name="vehicles"
                defaultValue={vehicles}
              >
                <option value="">Qualquer</option>
                <option value="yes">Com veículos</option>
                <option value="no">Sem veículos</option>
              </select>
            </label>
          </div>

          <div className={styles.formActions}>
            <Link href="/dashboard/search">
              Limpar filtros
            </Link>
            <button type="submit">Pesquisar</button>
          </div>
        </form>

        <ExportButtons input={exportInput} />

        <section className={styles.compareFormShell}>
          <div>
            <span>COMPARAR PERÍODOS</span>
            <h2>
              Veja o que mudou sem consumir Assistente IA
            </h2>
            <p>
              Compara volumes, tipos, pessoas, veículos,
              revisões e confiança média.
            </p>
          </div>

          <form method="get" className={styles.compareForm}>
            {Object.entries(preserved).map(([key, value]) => (
              <input
                key={key}
                type="hidden"
                name={key}
                value={value}
              />
            ))}
            <input type="hidden" name="compare" value="1" />

            <label>
              <span>A — início</span>
              <input
                type="date"
                name="a_from"
                defaultValue={aFrom}
              />
            </label>
            <label>
              <span>A — fim</span>
              <input
                type="date"
                name="a_to"
                defaultValue={aTo}
              />
            </label>
            <label>
              <span>B — início</span>
              <input
                type="date"
                name="b_from"
                defaultValue={bFrom}
              />
            </label>
            <label>
              <span>B — fim</span>
              <input
                type="date"
                name="b_to"
                defaultValue={bTo}
              />
            </label>
            <button type="submit">Comparar</button>
          </form>
        </section>

        {comparison ? (
          <ComparisonPanel comparison={comparison} />
        ) : null}

        <div className={styles.resultsHeading}>
          <div>
            <span>RESULTADOS DA PESQUISA</span>
            <h2>
              {result.total} evento
              {result.total === 1 ? "" : "s"} encontrado
              {result.total === 1 ? "" : "s"}
            </h2>
          </div>
          <small>
            Página {page} de {totalPages}
          </small>
        </div>

        <EventList
          rows={result.rows}
          timezone={timeZone}
          emptyMessage="Ajuste o período ou experimente termos mais amplos."
        />

        {totalPages > 1 ? (
          <nav className={styles.pagination}>
            {page > 1 ? (
              <Link href={pageHref(preserved, page - 1)}>
                ← Anterior
              </Link>
            ) : (
              <span />
            )}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(preserved, page + 1)}>
                Próxima →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
