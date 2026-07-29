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
  dateOnlyToIso,
  searchEvents,
  siteTimezone,
} from "@/src/lib/event-search-data";
import {
  EVENT_TYPE_OPTIONS,
} from "@/src/lib/event-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { EventList } from "./event-list";
import styles from "./events.module.css";

export const metadata = { title: "Eventos" };
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

function pageHref(
  current: Record<string, string>,
  page: number,
) {
  const params = new URLSearchParams(current);
  params.set("page", String(page));
  return `/dashboard/events?${params.toString()}`;
}

export default async function EventsPage({
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

  const siteId = scalar(rawParams.site);
  const cameraId = scalar(rawParams.camera);
  const timeZone = siteTimezone(sites, siteId);
  const today = todayInZone(timeZone);
  const defaultFrom = addDaysToDateOnly(today, -6);

  const fromDate = scalar(rawParams.from) || defaultFrom;
  const toDate = scalar(rawParams.to) || today;
  const eventType = scalar(rawParams.type);
  const review = scalar(rawParams.review) || "all";
  const page = Math.max(
    1,
    Number.parseInt(scalar(rawParams.page) || "1", 10) || 1,
  );
  const limit = 24;

  const result = await searchEvents(organization.id, {
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(
      addDaysToDateOnly(toDate, 1),
      timeZone,
    ),
    cameraId,
    siteId,
    eventType,
    reviewFilter: review,
    limit,
    offset: (page - 1) * limit,
  });

  const totalPages = Math.max(
    1,
    Math.ceil(result.total / limit),
  );

  const preserved = {
    from: fromDate,
    to: toDate,
    ...(siteId ? { site: siteId } : {}),
    ...(cameraId ? { camera: cameraId } : {}),
    ...(eventType ? { type: eventType } : {}),
    ...(review !== "all" ? { review } : {}),
  };

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
              EVENTOS · {organization.name.toUpperCase()}
            </span>
            <h1>Linha do tempo visual</h1>
            <p>
              Revise acontecimentos, consulte os quadros e ajude a
              calibrar a qualidade das análises.
            </p>
          </div>

          <Link
            className="panel-primary-action"
            href="/dashboard/search"
          >
            Pesquisa avançada
          </Link>
        </header>

        {scalar(rawParams.deleted) === "1" ? (
          <div className={styles.successMessage}>
            Evento removido da linha do tempo.
          </div>
        ) : null}

        <form className={styles.filters} method="get">
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
              <option value="">Todos os locais</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Câmera</span>
            <select name="camera" defaultValue={cameraId}>
              <option value="">Todas as câmeras</option>
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
              <option value="">Todos os tipos</option>
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
            <span>Revisão</span>
            <select name="review" defaultValue={review}>
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="required">Exigem revisão</option>
              <option value="reviewed">Já revisados</option>
              <option value="useful">Marcados como úteis</option>
              <option value="irrelevant">
                Marcados como irrelevantes
              </option>
              <option value="incorrect">
                Classificação corrigida
              </option>
            </select>
          </label>

          <button type="submit">Aplicar filtros</button>
        </form>

        <div className={styles.resultHeading}>
          <div>
            <span>RESULTADOS</span>
            <h2>
              {result.total} evento
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
        />

        {totalPages > 1 ? (
          <nav
            className={styles.pagination}
            aria-label="Paginação dos eventos"
          >
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
