import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  formatStorageBytes,
  getOrganizationRetentionUsage,
  retentionPlanLabel,
} from "@/src/lib/retention-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import styles from "./storage.module.css";

export const metadata = { title: "Dados armazenados | MonitorIA" };
export const dynamic = "force-dynamic";

function formatDate(value: string | null, timeZone: string) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function StoragePage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const cameras = await getOrganizationRetentionUsage(organization.id);
  const totals = cameras.reduce(
    (result, camera) => ({
      events: result.events + camera.retainedEvents,
      savedImages: result.savedImages + camera.longTermAssets,
      temporaryImages: result.temporaryImages + camera.temporaryAssets,
      clips: result.clips + camera.clipAssets,
      bytes: result.bytes + camera.totalBytes,
    }),
    {
      events: 0,
      savedImages: 0,
      temporaryImages: 0,
      clips: 0,
      bytes: 0,
    },
  );

  const longestHistoryDays = cameras.length
    ? Math.max(...cameras.map((camera) => camera.metadataRetentionDays))
    : 365;

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="storage"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              DADOS · {organization.name.toUpperCase()}
            </span>
            <h1>Dados armazenados</h1>
            <p>
              Veja o que fica disponível no histórico e por quanto tempo as
              imagens e vídeos de cada câmera são mantidos.
            </p>
          </div>

          <div className={styles.headerFact}>
            <span>Histórico pesquisável</span>
            <strong>até {longestHistoryDays} dias</strong>
          </div>
        </header>

        <DashboardSectionTabs group="settings" />

        <section className={styles.summaryGrid} aria-label="Resumo dos dados armazenados">
          <article>
            <span>Acontecimentos salvos</span>
            <strong>{totals.events.toLocaleString("pt-BR")}</strong>
            <small>disponíveis para pesquisa</small>
          </article>
          <article>
            <span>Imagens guardadas</span>
            <strong>{totals.savedImages.toLocaleString("pt-BR")}</strong>
            <small>mantidas conforme o plano</small>
          </article>
          <article>
            <span>Vídeos guardados</span>
            <strong>{totals.clips.toLocaleString("pt-BR")}</strong>
            <small>quando incluídos no plano</small>
          </article>
          <article>
            <span>Espaço usado</span>
            <strong>{formatStorageBytes(totals.bytes)}</strong>
            <small>imagens e vídeos armazenados</small>
          </article>
        </section>

        <section className={styles.explanation}>
          <div>
            <span>COMO FUNCIONA</span>
            <h2>O que fica salvo</h2>
          </div>
          <p>
            O histórico de acontecimentos continua pesquisável pelo período do
            plano. As imagens principais ficam guardadas para consulta. Outras
            imagens usadas apenas durante a análise são apagadas automaticamente
            depois do prazo indicado em cada câmera.
          </p>
          <Link href="/dashboard/plans">Comparar planos</Link>
        </section>

        <section className={styles.cameraSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>POR CÂMERA</span>
              <h2>Histórico, imagens e vídeos</h2>
            </div>
            <strong>{cameras.length}</strong>
          </div>

          {cameras.length ? (
            <div className={styles.cameraGrid}>
              {cameras.map((camera) => (
                <article className={styles.cameraCard} key={camera.cameraId}>
                  <div className={styles.cameraHeader}>
                    <div>
                      <span>Plano {retentionPlanLabel(camera.planCode)}</span>
                      <h3>{camera.cameraName}</h3>
                    </div>
                    <strong>{formatStorageBytes(camera.totalBytes)}</strong>
                  </div>

                  <dl className={styles.policyGrid}>
                    <div>
                      <dt>Histórico pesquisável</dt>
                      <dd>{camera.metadataRetentionDays} dias</dd>
                    </div>
                    <div>
                      <dt>Imagens guardadas por acontecimento</dt>
                      <dd>{camera.longTermKeyframes}</dd>
                    </div>
                    <div>
                      <dt>Imagens usadas só durante a análise</dt>
                      <dd>
                        Apagadas após {camera.temporaryFrameDays} dia
                        {camera.temporaryFrameDays === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt>Vídeos</dt>
                      <dd>
                        {camera.clipEnabled
                          ? `Guardados por ${camera.clipRetentionDays ?? 30} dias`
                          : "Não incluídos neste plano"}
                      </dd>
                    </div>
                  </dl>

                  <div className={styles.assetRows}>
                    <div>
                      <span>Acontecimentos</span>
                      <strong>{camera.retainedEvents.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Imagens guardadas</span>
                      <strong>{camera.longTermAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Imagens temporárias</span>
                      <strong>{camera.temporaryAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Vídeos</span>
                      <strong>{camera.clipAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                  </div>

                  <footer>
                    <span>
                      {camera.oldestRetainedAt
                        ? `Primeiro registro disponível: ${formatDate(
                            camera.oldestRetainedAt,
                            camera.timezone,
                          )}`
                        : "Ainda não há registros armazenados"}
                    </span>
                    {camera.nextTemporaryExpiry ? (
                      <span>
                        Próxima limpeza automática: {formatDate(
                          camera.nextTemporaryExpiry,
                          camera.timezone,
                        )}
                      </span>
                    ) : (
                      <span>Sem limpeza pendente</span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <strong>Nenhuma câmera disponível</strong>
              <p>
                Cadastre uma câmera para acompanhar o histórico e os arquivos
                armazenados.
              </p>
              <Link href="/dashboard/cameras">Abrir câmeras</Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
