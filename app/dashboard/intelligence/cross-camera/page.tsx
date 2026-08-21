import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getCrossCameraJourneys } from "@/src/lib/operations-data";
import { formatMonitoringDateTime } from "@/src/lib/monitoring-display";
import { IntelligencePageFrame } from "../intelligence-page-frame";
import styles from "./cross-camera.module.css";

export const metadata = { title: "Entre câmeras | MonitorIA" };
export const dynamic = "force-dynamic";

function approximateTravel(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds));

  if (safeSeconds < 60) {
    return `Aproximadamente ${safeSeconds} segundo${safeSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.max(1, Math.round(safeSeconds / 60));
  return `Aproximadamente ${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

function subjectLabel(subjectType: "person" | "vehicle") {
  return subjectType === "person" ? "Pessoa" : "Veículo";
}

function humanExplanation(subjectType: "person" | "vehicle") {
  if (subjectType === "person") {
    return "Os registros parecem mostrar a mesma pessoa, mas o MonitorIA não faz reconhecimento facial.";
  }

  return "Os registros parecem mostrar o mesmo veículo com base nas características visíveis e no intervalo entre as câmeras.";
}

function VisualRecord({
  assetId,
  eventId,
  cameraName,
  observedAt,
  timezone,
  position,
}: {
  assetId: string | null;
  eventId: string;
  cameraName: string;
  observedAt: string;
  timezone: string | null;
  position: "Primeiro registro" | "Segundo registro";
}) {
  return (
    <figure className={styles.visualRecord}>
      <Link
        href={`/dashboard/events/${eventId}`}
        className={styles.visualLink}
        aria-label={`Abrir ${position.toLowerCase()} em ${cameraName}`}
      >
        {assetId ? (
          <img
            src={`/api/storage-assets/${assetId}`}
            alt={`${position} em ${cameraName}`}
            loading="lazy"
          />
        ) : (
          <div className={styles.imageUnavailable}>
            <span>Imagem não disponível</span>
            <small>O registro ainda pode ser consultado.</small>
          </div>
        )}
      </Link>
      <figcaption>
        <span>{position}</span>
        <strong>{cameraName}</strong>
        <small>{formatMonitoringDateTime(observedAt, timezone)}</small>
      </figcaption>
    </figure>
  );
}

export default async function CrossCameraPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const journeys = await getCrossCameraJourneys(organization.id);

  return (
    <IntelligencePageFrame
      organizationName={organization.name}
      userEmail={user.email}
      eyebrow={`ENTRE CÂMERAS · ${organization.name.toUpperCase()}`}
      title="Entre câmeras"
      description="Veja quando registros recentes parecem mostrar uma passagem da mesma pessoa ou veículo entre câmeras diferentes do mesmo local."
      actions={
        <Link className="panel-primary-action" href="/dashboard/search">
          Perguntar à Pesquisa IA
        </Link>
      }
    >
      <section className={styles.notice}>
        <div className={styles.noticeIcon} aria-hidden="true">
          i
        </div>
        <div>
          <strong>Comparação visual, sem reconhecimento facial</strong>
          <p>
            O MonitorIA compara tempo e características visíveis dos registros.
            O resultado é uma possibilidade para ajudar na análise, não uma
            confirmação de identidade.
          </p>
        </div>
      </section>

      {journeys.length ? (
        <section className={styles.cards} aria-label="Passagens recentes entre câmeras">
          {journeys.map((journey) => (
            <article className={styles.card} key={journey.id}>
              <header className={styles.cardHeader}>
                <div>
                  <span className={styles.eyebrow}>
                    {journey.siteName} · {subjectLabel(journey.subjectType)}
                  </span>
                  <h2>Possível passagem entre câmeras</h2>
                  <p className={styles.route}>
                    {journey.fromCameraName} <span aria-hidden="true">→</span>{" "}
                    {journey.toCameraName}
                  </p>
                </div>
                <span className={styles.timeBadge}>
                  {approximateTravel(journey.travelSeconds)}
                </span>
              </header>

              <div className={styles.visualGrid}>
                <VisualRecord
                  assetId={journey.fromAssetId}
                  eventId={journey.fromEventId}
                  cameraName={journey.fromCameraName}
                  observedAt={journey.observedFrom}
                  timezone={journey.siteTimezone}
                  position="Primeiro registro"
                />
                <VisualRecord
                  assetId={journey.toAssetId}
                  eventId={journey.toEventId}
                  cameraName={journey.toCameraName}
                  observedAt={journey.observedTo}
                  timezone={journey.siteTimezone}
                  position="Segundo registro"
                />
              </div>

              <div className={styles.explanation}>
                <strong>O que o MonitorIA percebeu</strong>
                <p>{humanExplanation(journey.subjectType)}</p>
              </div>

              <footer className={styles.cardFooter}>
                <Link href={`/dashboard/events/${journey.fromEventId}`}>
                  Ver primeiro registro
                </Link>
                <Link href={`/dashboard/events/${journey.toEventId}`}>
                  Ver segundo registro
                </Link>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.empty}>
          <div className={styles.emptyIcon} aria-hidden="true">
            ↔
          </div>
          <div>
            <h2>Nenhuma passagem recente entre câmeras</h2>
            <p>
              Quando dois registros de câmeras diferentes do mesmo local tiverem
              características e horários compatíveis, a comparação aparecerá aqui.
            </p>
          </div>
        </section>
      )}
    </IntelligencePageFrame>
  );
}
