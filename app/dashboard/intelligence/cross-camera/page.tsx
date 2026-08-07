import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getCrossCameraJourneys } from "@/src/lib/operations-data";
import { IntelligencePageFrame } from "../intelligence-page-frame";
import styles from "../../operations/operations.module.css";

export const metadata = { title: "Passagens entre câmeras" };
export const dynamic = "force-dynamic";

function confidence(value: number) {
  return `${Math.round(value * 100)}%`;
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
      eyebrow={`SEQUÊNCIAS · ${organization.name.toUpperCase()}`}
      title="Passagens prováveis entre câmeras"
      description="Hipóteses temporárias formadas por janela de tempo e características visíveis, sem reconhecimento facial."
      actions={<Link className="panel-primary-action" href="/dashboard/search">Perguntar à Pesquisa IA</Link>}
    >
      <div className={styles.notice}>
        <h2>Hipóteses, não identidades</h2>
        <p>Uma aparência semelhante pode pertencer a pessoas ou veículos diferentes. O MonitorIA mostra a hipótese concorrente e mantém os registros por no máximo 24 horas.</p>
      </div>
      {journeys.length ? (
        <div className={styles.cards}>
          {journeys.map((journey) => (
            <article className={styles.card} key={journey.id}>
              <header>
                <div><span className={styles.eyebrow}>{journey.siteName} · {journey.subjectType === "person" ? "Pessoa provável" : "Veículo provável"}</span><h2>{journey.probableDirection}</h2></div>
                <span className={`${styles.badge} ${styles.info}`}>{confidence(journey.confidence)}</span>
              </header>
              <p>{journey.summary}</p>
              <div className={styles.journeyMeta}>
                <span>{new Date(journey.observedFrom).toLocaleString("pt-BR")}</span>
                <span>{journey.travelSeconds}s entre observações</span>
                <span>{journey.competingHypotheses.length} hipóteses consideradas</span>
              </div>
              <footer>
                <span className={styles.muted}>Câmeras: {journey.fromCameraName} → {journey.toCameraName}</span>
                <span className={styles.eventLinks}><Link href={`/dashboard/events/${journey.fromEventId}`}>Primeira evidência</Link><Link href={`/dashboard/events/${journey.toEventId}`}>Segunda evidência</Link></span>
              </footer>
            </article>
          ))}
        </div>
      ) : <div className={styles.empty}><h3>Nenhuma passagem provável recente</h3><p className={styles.muted}>As hipóteses aparecem quando há observações compatíveis em câmeras diferentes do mesmo local.</p></div>}
    </IntelligencePageFrame>
  );
}

