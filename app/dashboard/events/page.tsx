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
import { EVENT_TYPE_OPTIONS } from "@/src/lib/event-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { EventExportButtons } from "./event-export-buttons";
import { EventList } from "./event-list";
import { EventsRealtimeRefresh } from "./events-realtime-refresh";
import styles from "./events.module.css";
import disclosureStyles from "./mobile-disclosure.module.css";
import realtimeStyles from "./events-realtime-refresh.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Eventos" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function scalar(value: string | string[] | undefined) {
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

function compactDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function pageHref(current: Record<string, string>, page: number) {
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
    to: dateOnlyToIso(addDaysToDateOnly(toDate, 1), timeZone),
    cameraId,
    siteId,
    eventType,
    reviewFilter: review,
    limit,
    offset: (page - 1) * limit,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / limit));
  const preserved = {
    from: fromDate,
    to: toDate,
    ...(siteId ? { site: siteId } : {}),
    ...(cameraId ? { camera: cameraId } : {}),
    ...(eventType ? { type: eventType } : {}),
    ...(review !== "all" ? { review } : {}),
  };

  const optionalFilterCount = [
    siteId,
    cameraId,
    eventType,
    review !== "all" ? review : "",
  ].filter(Boolean).length;

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
              Revise os acontecimentos e exporte qualquer período para
              usar em outra IA, integração ou relatório.
            </p>
          </div>

          <Link
            className="panel-primary-action"
            href="/dashboard/search"
          >
            Conversar na Pesquisa
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />


        {scalar(rawParams.deleted) === "1" ? (
          <div className={styles.successMessage}>
            Evento removido da linha do tempo.
          </div>
        ) : null}

        <details
          className={`${disclosureStyles.disclosure} ${disclosureStyles.filterDisclosure}`}
        >
          <summary className={disclosureStyles.summary}>
            <span className={disclosureStyles.summaryCopy}>
              <span>FILTROS</span>
              <strong>
                {compactDate(fromDate)} até {compactDate(toDate)}
              </strong>
              <small>
                {optionalFilterCount
                  ? `${optionalFilterCount} filtro${
                      optionalFilterCount === 1 ? "" : "s"
                    } adicional${
                      optionalFilterCount === 1 ? "" : "is"
                    } ativo${
                      optionalFilterCount === 1 ? "" : "s"
                    }`
                  : "Todos os locais, câmeras e tipos"}
              </small>
            </span>
            <span
              className={disclosureStyles.chevron}
              aria-hidden="true"
            >
              ⌄
            </span>
          </summary>

          <div className={disclosureStyles.content}>
            <form
              className={`${styles.filters} ${disclosureStyles.filterForm}`}
              method="get"
            >
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
                    <option key={option.value} value={option.value}>
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
          </div>
        </details>

        <EventExportButtons
          total={result.total}
          filters={{
            from: fromDate,
            to: toDate,
            site: siteId,
            camera: cameraId,
            type: eventType,
            review,
          }}
        />

        <div className={styles.resultHeading}>
          <div>
            <span>RESULTADOS</span>
            <h2>
              {result.total} evento{result.total === 1 ? "" : "s"}
            </h2>
          </div>

          <div className={realtimeStyles.headingMeta}>
            <small>
              Página {page} de {totalPages}
            </small>
            <EventsRealtimeRefresh
              organizationId={organization.id}
            />
          </div>
        </div>

        <EventList rows={result.rows} timezone={timeZone} />

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
