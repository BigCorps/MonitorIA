import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCameraProfileWorkspace } from "@/src/lib/camera-profile-data";
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
import { searchEventTimeline } from "@/src/lib/event-timeline-data";
import { EVENT_TYPE_OPTIONS } from "@/src/lib/event-labels";
import { paginationWindow } from "@/src/lib/pagination";
import { DashboardSidebar } from "../dashboard-sidebar";
import { CameraMultiSelect } from "../camera-multi-select";
import {
  cameraSelectionCsv,
  parseCameraSelection,
} from "@/src/lib/camera-selection";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import { EventExportButtons } from "./event-export-buttons";
import { EventList } from "./event-list";
import { EventsRealtimeRefresh } from "./events-realtime-refresh";
import styles from "./events.module.css";
import disclosureStyles from "./mobile-disclosure.module.css";
import realtimeStyles from "./events-realtime-refresh.module.css";

export const metadata = { title: "Acontecimentos" };
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

function compactDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function pageHref(current: Record<string, string>, page: number) {
  const params = new URLSearchParams(current);
  params.set("page", String(page));
  return `/dashboard/events?${params.toString()}`;
}

type StarterFrame = {
  cameraName: string;
  siteName: string;
  url: string;
};

export default async function EventsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const [sites, cameras, rawParams] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
    searchParams,
  ]);

  const siteId = scalar(rawParams.site);
  const cameraIds = parseCameraSelection(rawParams.cameras ?? rawParams.camera, cameras);
  const timeZone = siteTimezone(sites, siteId);
  const today = todayInZone(timeZone);
  const defaultFrom = addDaysToDateOnly(today, -6);
  const fromDate = scalar(rawParams.from) || defaultFrom;
  const toDate = scalar(rawParams.to) || today;
  const eventType = scalar(rawParams.type);
  const review = scalar(rawParams.review) || "all";
  const page = Math.max(1, Number.parseInt(scalar(rawParams.page) || "1", 10) || 1);
  const limit = 24;

  // 1.0.2: uma única RPC paginada para 0, 1 ou N câmeras. A mesma resposta
  // contém acontecimentos concluídos e recibos ainda em análise.
  const result = await searchEventTimeline(organization.id, {
    from: dateOnlyToIso(fromDate, timeZone),
    to: dateOnlyToIso(addDaysToDateOnly(toDate, 1), timeZone),
    cameraIds,
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
    ...(cameraIds.length ? { cameras: cameraSelectionCsv(cameraIds) } : {}),
    ...(eventType ? { type: eventType } : {}),
    ...(review !== "all" ? { review } : {}),
  };
  const optionalFilterCount = [
    siteId,
    cameraIds.length ? "cameras" : "",
    eventType,
    review !== "all" ? review : "",
  ].filter(Boolean).length;
  const visiblePages = paginationWindow(page, totalPages, 5);

  let starterFrame: StarterFrame | null = null;
  if (result.total === 0 && page === 1) {
    const starterCameras = cameraIds.length
      ? cameras.filter((camera) => cameraIds.includes(camera.id))
      : cameras;

    for (const camera of starterCameras.slice(0, 6)) {
      try {
        const workspace = await getCameraProfileWorkspace(organization.id, camera.id);
        if (workspace.latestProfile && workspace.frame?.url) {
          starterFrame = {
            cameraName: camera.name,
            siteName: camera.siteName,
            url: workspace.frame.url,
          };
          break;
        }
      } catch (error) {
        console.error(
          "Falha ao carregar imagem inicial dos acontecimentos:",
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

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
              ACONTECIMENTOS · {organization.name.toUpperCase()}
            </span>
            <h1>O que aconteceu</h1>
            <p>
              Consulte os registros das câmeras, veja imagens e vídeos e
              corrija uma análise quando necessário.
            </p>
          </div>

          <Link className="panel-primary-action" href="/dashboard/search">
            Perguntar à Pesquisa IA
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />

        {scalar(rawParams.deleted) === "1" ? (
          <div className={styles.successMessage}>
            Acontecimento removido da linha do tempo.
          </div>
        ) : null}

        <details
          open
          className={`${disclosureStyles.disclosure} ${disclosureStyles.filterDisclosure}`}
        >
          <summary className={disclosureStyles.summary}>
            <span className={disclosureStyles.summaryCopy}>
              <span>FILTROS</span>
              <strong>{compactDate(fromDate)} até {compactDate(toDate)}</strong>
              <small>
                {optionalFilterCount
                  ? `${optionalFilterCount} filtro${optionalFilterCount === 1 ? "" : "s"} adicional${optionalFilterCount === 1 ? "" : "is"} ativo${optionalFilterCount === 1 ? "" : "s"}`
                  : "Todos os locais, câmeras e tipos"}
              </small>
            </span>
            <span className={disclosureStyles.chevron} aria-hidden="true">⌄</span>
          </summary>

          <div className={disclosureStyles.content}>
            <form className={`${styles.filters} ${disclosureStyles.filterForm}`} method="get">
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
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </label>
              <CameraMultiSelect cameras={cameras} selectedIds={cameraIds} />
              <label>
                <span>Tipo</span>
                <select name="type" defaultValue={eventType}>
                  <option value="">Todos os tipos</option>
                  {EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Avaliação</span>
                <select name="review" defaultValue={review}>
                  <option value="all">Todos, exceto irrelevantes</option>
                  <option value="pending">Pendentes</option>
                  <option value="required">Precisam de revisão</option>
                  <option value="reviewed">Já avaliados</option>
                  <option value="useful">Confirmados como corretos</option>
                  <option value="incorrect">Classificação corrigida</option>
                  <option value="irrelevant">Marcados como irrelevantes</option>
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
            camera: cameraIds.length === 1 ? cameraIds[0] : "",
            type: eventType,
            review,
          }}
          multiCameraSelection={cameraIds.length > 1}
        />

        <div className={styles.resultHeading}>
          <div>
            <span>RESULTADOS</span>
            <h2>{result.total} registro{result.total === 1 ? "" : "s"}</h2>
          </div>
          <div className={realtimeStyles.headingMeta}>
            <small>Página {page} de {totalPages}</small>
            <EventsRealtimeRefresh organizationId={organization.id} />
          </div>
        </div>

        {result.rows.length ? (
          <EventList
            rows={result.rows}
            timezone={timeZone}
            detailParams={{ ...preserved, page: String(page) }}
          />
        ) : starterFrame ? (
          <section className={styles.card}>
            <div className={styles.thumbnail}>
              <img src={starterFrame.url} alt={`Imagem inicial da câmera ${starterFrame.cameraName}`} />
              <span>Imagem de referência</span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardHeading}>
                <div>
                  <span>CONFIGURAÇÃO CONCLUÍDA</span>
                  <h2>Perfil da câmera salvo</h2>
                </div>
              </div>
              <p>
                Esta é a primeira imagem recebida de {starterFrame.cameraName}
                {starterFrame.siteName ? ` · ${starterFrame.siteName}` : ""}. O MonitorIA
                já conhece o ambiente e começou a acompanhar a câmera. Esta imagem não é
                um acontecimento; os primeiros registros aparecerão aqui assim que um
                movimento relevante terminar e for analisado.
              </p>
              <div className={styles.meta}>
                <span>Perfil salvo</span>
                <span>Aguardando primeiro acontecimento</span>
              </div>
            </div>
          </section>
        ) : (
          <EventList
            rows={[]}
            timezone={timeZone}
            emptyMessage="O MonitorIA está acompanhando as câmeras. Os primeiros acontecimentos aparecerão aqui assim que forem recebidos."
          />
        )}

        {totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Paginação dos acontecimentos">
            {page > 1 ? (
              <Link className={styles.paginationDirection} href={pageHref(preserved, page - 1)}>
                ← Anterior
              </Link>
            ) : (
              <span className={styles.paginationDirectionDisabled}>← Anterior</span>
            )}

            <div className={styles.paginationPages}>
              {visiblePages.hasPreviousBlock ? (
                <Link
                  href={pageHref(preserved, visiblePages.previousBlockPage)}
                  aria-label="Mostrar as cinco páginas anteriores"
                >
                  …
                </Link>
              ) : null}

              {visiblePages.pages.map((pageNumber: number) => (
                <Link
                  key={pageNumber}
                  href={pageHref(preserved, pageNumber)}
                  aria-current={pageNumber === page ? "page" : undefined}
                >
                  {pageNumber}
                </Link>
              ))}

              {visiblePages.hasNextBlock ? (
                <Link
                  href={pageHref(preserved, visiblePages.nextBlockPage)}
                  aria-label="Mostrar as próximas cinco páginas"
                >
                  …
                </Link>
              ) : null}
            </div>

            {page < totalPages ? (
              <Link className={styles.paginationDirection} href={pageHref(preserved, page + 1)}>
                Próxima →
              </Link>
            ) : (
              <span className={styles.paginationDirectionDisabled}>Próxima →</span>
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
