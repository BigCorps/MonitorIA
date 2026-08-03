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
import styles from "./storage.module.css";

export const metadata = { title: "Armazenamento" };
export const dynamic = "force-dynamic";

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
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
      longTerm: result.longTerm + camera.longTermAssets,
      temporary: result.temporary + camera.temporaryAssets,
      clips: result.clips + camera.clipAssets,
      bytes: result.bytes + camera.totalBytes,
      mismatches:
        result.mismatches + camera.eventsWithKeyframeMismatch,
    }),
    {
      events: 0,
      longTerm: 0,
      temporary: 0,
      clips: 0,
      bytes: 0,
      mismatches: 0,
    },
  );

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
              RETENÇÃO · {organization.name.toUpperCase()}
            </span>
            <h1>Histórico e armazenamento</h1>
            <p>
              Acompanhe o histórico pesquisável, as imagens preservadas e os
              arquivos temporários de cada câmera.
            </p>
          </div>

          <div className={styles.headerFact}>
            <span>Histórico pesquisável</span>
            <strong>365 dias</strong>
          </div>
        </header>

        {totals.mismatches > 0 ? (
          <div className={styles.warning}>
            <strong>Retenção em reconciliação</strong>
            <span>
              {totals.mismatches} acontecimento(s) apresentam divergência na
              quantidade de imagens. O cron tentará corrigir automaticamente.
            </span>
          </div>
        ) : (
          <div className={styles.success}>
            <strong>Retenção consistente</strong>
            <span>
              Todos os acontecimentos possuem a quantidade correta de imagens
              para o plano usado na análise.
            </span>
          </div>
        )}

        <section className={styles.summaryGrid}>
          <article>
            <span>Acontecimentos</span>
            <strong>{totals.events.toLocaleString("pt-BR")}</strong>
            <small>metadados pesquisáveis</small>
          </article>
          <article>
            <span>Imagens de longo prazo</span>
            <strong>{totals.longTerm.toLocaleString("pt-BR")}</strong>
            <small>preservadas conforme o plano</small>
          </article>
          <article>
            <span>Arquivos temporários</span>
            <strong>{totals.temporary.toLocaleString("pt-BR")}</strong>
            <small>removidos automaticamente</small>
          </article>
          <article>
            <span>Uso total</span>
            <strong>{formatStorageBytes(totals.bytes)}</strong>
            <small>imagens e clipes registrados</small>
          </article>
        </section>

        <section className={styles.explanation}>
          <div>
            <span>COMO FUNCIONA</span>
            <h2>Texto por 365 dias, imagens conforme o plano</h2>
          </div>
          <p>
            Essencial preserva o pico do acontecimento. Atenta preserva início
            e pico. Detalhada preserva início, pico e fim. Os demais quadros são
            temporários e servem somente para melhorar a análise.
          </p>
          <Link href="/dashboard/plans">Comparar planos</Link>
        </section>

        <section className={styles.cameraSection}>
          <div className={styles.sectionHeading}>
            <div>
              <span>CÂMERAS</span>
              <h2>Política aplicada</h2>
            </div>
            <strong>{cameras.length}</strong>
          </div>

          {cameras.length ? (
            <div className={styles.cameraGrid}>
              {cameras.map((camera) => (
                <article className={styles.cameraCard} key={camera.cameraId}>
                  <div className={styles.cameraHeader}>
                    <div>
                      <span>{retentionPlanLabel(camera.planCode)}</span>
                      <h3>{camera.cameraName}</h3>
                    </div>
                    <strong>{formatStorageBytes(camera.totalBytes)}</strong>
                  </div>

                  <dl className={styles.policyGrid}>
                    <div>
                      <dt>Metadados</dt>
                      <dd>{camera.metadataRetentionDays} dias</dd>
                    </div>
                    <div>
                      <dt>Imagens por evento</dt>
                      <dd>{camera.longTermKeyframes}</dd>
                    </div>
                    <div>
                      <dt>Quadros temporários</dt>
                      <dd>{camera.temporaryFrameDays} dias</dd>
                    </div>
                    <div>
                      <dt>Clipes</dt>
                      <dd>
                        {camera.clipEnabled
                          ? `${camera.clipRetentionDays ?? 30} dias`
                          : "Não incluídos"}
                      </dd>
                    </div>
                  </dl>

                  <div className={styles.assetRows}>
                    <div>
                      <span>Eventos</span>
                      <strong>{camera.retainedEvents.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Imagens longas</span>
                      <strong>{camera.longTermAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Temporários</span>
                      <strong>{camera.temporaryAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div>
                      <span>Clipes</span>
                      <strong>{camera.clipAssets.toLocaleString("pt-BR")}</strong>
                    </div>
                  </div>

                  <div className={styles.storageBreakdown}>
                    <div>
                      <span>Longo prazo</span>
                      <strong>{formatStorageBytes(camera.longTermBytes)}</strong>
                    </div>
                    <div>
                      <span>Temporário</span>
                      <strong>{formatStorageBytes(camera.temporaryBytes)}</strong>
                    </div>
                    <div>
                      <span>Clipes</span>
                      <strong>{formatStorageBytes(camera.clipBytes)}</strong>
                    </div>
                  </div>

                  <footer>
                    <span>
                      Histórico desde {formatDate(camera.oldestRetainedAt)}
                    </span>
                    {camera.nextTemporaryExpiry ? (
                      <span>
                        Próximo expurgo: {formatDate(camera.nextTemporaryExpiry)}
                      </span>
                    ) : (
                      <span>Sem arquivos temporários pendentes</span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <strong>Nenhuma câmera disponível</strong>
              <p>Cadastre uma câmera para acompanhar a retenção.</p>
              <Link href="/dashboard/cameras">Abrir câmeras</Link>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
