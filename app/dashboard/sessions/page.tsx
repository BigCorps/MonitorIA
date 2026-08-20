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
  siteTimezone,
} from "@/src/lib/event-search-data";
import { searchOperationalSessions } from "@/src/lib/operational-session-data";
import { OPERATIONAL_SESSION_TYPE_OPTIONS } from "@/src/lib/operational-session-labels";
import { DashboardSidebar } from "../dashboard-sidebar";
import { SessionList } from "./session-list";
import { SessionsRealtimeRefresh } from "./sessions-realtime-refresh";
import styles from "./sessions.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Períodos" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

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

function pageHref(current: Record<string, string>, page: number) {
  const params = new URLSearchParams(current);
  params.set("page", String(page));
  return `/dashboard/sessions?${params.toString()}`;
}

export default async function SessionsPage({
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
  const fromDate = scalar(rawParams.from) || addDaysToDateOnly(today, -6);
  const toDate = scalar(rawParams.to) || today;
  const sessionType = scalar(rawParams.type);
  const status = scalar(rawParams.status) || "all";
  const page = Math.max(
    1,
    Number.parseInt(scalar(rawParams.page) || "1", 10) || 1,
  );
  const limit = 24;

  const result = await searchOperationalSessions(organization.id, {
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(addDaysToDateOnly(toDate, 1), timeZone),
    cameraId,
    siteId,
    sessionType,
    status,
    limit,
    offset: (page - 1) * limit,
  });

  const totalPages = Math.max(1, Math.ceil(result.total / limit));
  const preserved = {
    from: fromDate,
    to: toDate,
    ...(siteId ? { site: siteId } : {}),
    ...(cameraId ? { camera: cameraId } : {}),
    ...(sessionType ? { type: sessionType } : {}),
    ...(status !== "all" ? { status } : {}),
  };

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="sessions"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PERÍODOS · {organization.name.toUpperCase()}
            </span>
            <h1>Atividades agrupadas</h1>
            <p>
              Acompanhe atendimentos, visitas e outras atividades que aconteceram
              em sequência, sem precisar abrir cada registro separadamente.
            </p>
          </div>

          <Link className="panel-primary-action" href="/dashboard/events">
            Ver acontecimentos
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />

        <form className={styles.filters} method="get">
          <label>
            <span>De</span>
            <input type="date" name="from" defaultValue={fromDate} />
          </label>
          <label>
            <span>Até</span>
            <input type="date" name="to" defaultValue={toDate} />
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
            <select name="type" defaultValue={sessionType}>
              <option value="">Todos os tipos</option>
              {OPERATIONAL_SESSION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Situação</span>
            <select name="status" defaultValue={status}>
              <option value="all">Todas</option>
              <option value="open">Em andamento</option>
              <option value="completed">Concluídos</option>
              <option value="closed_by_inactivity">Encerrados</option>
              <option value="uncertain">Não confirmados</option>
            </select>
          </label>
          <button type="submit">Aplicar filtros</button>
        </form>

        <div className={styles.resultHeading}>
          <div>
            <span>RESULTADOS</span>
            <h2>
              {result.total} período{result.total === 1 ? "" : "s"}
            </h2>
          </div>

          <div className={styles.headingMeta}>
            <small>
              Página {page} de {totalPages}
            </small>
            <SessionsRealtimeRefresh organizationId={organization.id} />
          </div>
        </div>

        <SessionList rows={result.rows} timezone={timeZone} />

        {totalPages > 1 ? (
          <nav
            className={styles.pagination}
            aria-label="Paginação dos períodos"
          >
            {page > 1 ? (
              <Link href={pageHref(preserved, page - 1)}>← Anterior</Link>
            ) : (
              <span />
            )}
            <span>
              {page} / {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(preserved, page + 1)}>Próxima →</Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
