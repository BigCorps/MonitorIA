import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { CHILD_SAFETY_MONITORING_GOAL } from "@/src/vision/child-safety";
import { DashboardSidebar } from "../../dashboard-sidebar";
import styles from "./child-safety.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Piloto Proteção da Infância",
};

type AgeGroup = "child" | "adult" | "unknown";

type VisualPerson = {
  localTrackId: string | null;
  ageGroup: AgeGroup;
  confidence: number;
  role: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relationOne(value: any) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function peopleFromPayload(payload: unknown): VisualPerson[] {
  const root = objectValue(payload);
  if (!Array.isArray(root.people)) return [];

  return root.people.map((raw) => {
    const person = objectValue(raw);
    const group =
      person.apparentAgeGroup === "child" ||
      person.apparentAgeGroup === "adult"
        ? person.apparentAgeGroup
        : "unknown";

    return {
      localTrackId: person.localTrackId
        ? String(person.localTrackId)
        : null,
      ageGroup: group,
      confidence: Math.max(
        0,
        Math.min(
          1,
          Number(person.apparentAgeGroupConfidence ?? 0),
        ),
      ),
      role: String(person.role ?? "unknown"),
    };
  });
}

function groupLabel(group: AgeGroup) {
  if (group === "child") return "Provável criança";
  if (group === "adult") return "Provável adulto";
  return "Não determinado";
}

export default async function ChildSafetyPilotPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const admin = createAdminClient();

  const { data: enabledProfiles } = await admin
    .from("camera_profiles")
    .select("camera_id,monitoring_goals,camera:cameras(id,name)")
    .eq("organization_id", organization.id)
    .eq("is_active", true);

  const enabledCameraIds = new Set(
    (enabledProfiles ?? [])
      .filter((row: any) =>
        Array.isArray(row.monitoring_goals) &&
        row.monitoring_goals.some(
          (goal: unknown) =>
            String(goal).trim().toUpperCase() ===
            CHILD_SAFETY_MONITORING_GOAL,
        ),
      )
      .map((row: any) => String(row.camera_id)),
  );

  const { data: rows, error } = enabledCameraIds.size
    ? await admin
        .from("events")
        .select(`
          id,
          camera_id,
          started_at,
          headline,
          summary,
          analyzed_payload,
          camera:cameras(id,name),
          site:sites(id,name,timezone)
        `)
        .eq("organization_id", organization.id)
        .in("camera_id", [...enabledCameraIds])
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(150)
    : { data: [], error: null };

  if (error) {
    console.error(
      "Falha ao carregar piloto de proteção da infância:",
      error.message,
    );
  }

  const events = (rows ?? [])
    .map((row: any) => {
      const people = peopleFromPayload(row.analyzed_payload);
      const children = people.filter(
        (person) => person.ageGroup === "child",
      );
      const adults = people.filter(
        (person) => person.ageGroup === "adult",
      );

      return {
        id: String(row.id),
        cameraId: String(row.camera_id),
        cameraName: String(relationOne(row.camera)?.name ?? "Câmera"),
        siteName: String(relationOne(row.site)?.name ?? "Local"),
        timezone: String(
          relationOne(row.site)?.timezone ?? "America/Sao_Paulo",
        ),
        startedAt: String(row.started_at),
        headline: String(row.headline ?? row.summary ?? "Acontecimento"),
        people,
        childCount: children.length,
        adultCount: adults.length,
        maxChildConfidence: children.reduce(
          (max, person) => Math.max(max, person.confidence),
          0,
        ),
      };
    })
    .filter((event) =>
      event.people.some((person) => person.ageGroup !== "unknown"),
    );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="events"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PILOTO · PROTEÇÃO DA INFÂNCIA
            </span>
            <h1>Classificação visual criança/adulto</h1>
            <p>
              Triagem experimental por câmera. A classificação é visual e
              probabilística; não determina idade legal, identidade,
              parentesco, abandono ou vulnerabilidade por si só.
            </p>
          </div>

          <Link href="/dashboard/events" className="back-link">
            Ver acontecimentos →
          </Link>
        </header>

        <div className={styles.notice}>
          <strong>Revisão humana obrigatória</strong>
          <p>
            “Provável criança” significa apenas aparência visual ampla
            compatível nos quadros disponíveis. Casos ambíguos devem ficar
            como “não determinado”. O piloto não usa reconhecimento facial.
          </p>
        </div>

        <section className={styles.metrics}>
          <article>
            <span>Câmeras habilitadas</span>
            <strong>{enabledCameraIds.size}</strong>
          </article>
          <article>
            <span>Eventos classificados</span>
            <strong>{events.length}</strong>
          </article>
          <article>
            <span>Com provável criança</span>
            <strong>
              {events.filter((event) => event.childCount > 0).length}
            </strong>
          </article>
        </section>

        {!enabledCameraIds.size ? (
          <div className={styles.empty}>
            <strong>Nenhuma câmera habilitada para o piloto.</strong>
            <p>
              Ative uma câmera com o SQL manual do pacote.
            </p>
          </div>
        ) : events.length ? (
          <div className={styles.list}>
            {events.map((event) => (
              <article className={styles.card} key={event.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <span>
                      {event.siteName} · {event.cameraName}
                    </span>
                    <h2>{event.headline}</h2>
                  </div>
                  <time>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                      timeZone: event.timezone,
                    }).format(new Date(event.startedAt))}
                  </time>
                </div>

                <div className={styles.summary}>
                  <span>
                    Prováveis crianças: <strong>{event.childCount}</strong>
                  </span>
                  <span>
                    Prováveis adultos: <strong>{event.adultCount}</strong>
                  </span>
                  {event.childCount > 0 ? (
                    <span>
                      Maior confiança infantil:{" "}
                      <strong>
                        {Math.round(event.maxChildConfidence * 100)}%
                      </strong>
                    </span>
                  ) : null}
                </div>

                <div className={styles.people}>
                  {event.people.map((person, index) => (
                    <div
                      key={person.localTrackId ?? `${event.id}-${index}`}
                      data-group={person.ageGroup}
                    >
                      <strong>
                        {groupLabel(person.ageGroup)}
                      </strong>
                      <span>
                        confiança {Math.round(person.confidence * 100)}%
                      </span>
                      <small>
                        classificação visual ampla · papel operacional{" "}
                        {person.role}
                      </small>
                    </div>
                  ))}
                </div>

                <Link
                  href={`/dashboard/events/${event.id}`}
                  className={styles.link}
                >
                  Abrir acontecimento e evidências →
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <strong>Aguardando acontecimentos classificados.</strong>
            <p>
              Assim que a câmera habilitada registrar pessoas, os resultados
              aparecem aqui.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
