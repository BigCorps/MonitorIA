import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { saveDiscoveredCameraNamesAction } from "./actions";
import styles from "./setup.module.css";

export const metadata = { title: "Identificar câmeras" };
export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function CameraSetupPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = createAdminClient();
  const [{ data: cameras }, query] = await Promise.all([
    supabase
      .from("cameras")
      .select("id,name,status,stream_label,created_at")
      .eq("organization_id", organization.id)
      .is("setup_named_at", null)
      .order("created_at", { ascending: true }),
    searchParams,
  ]);

  if (!cameras?.length) redirect("/dashboard/commercial-choice");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">PRIMEIRO ACESSO · PASSO 3</span>
            <h1>Dê um nome para cada câmera encontrada</h1>
            <p>
              A descoberta já terminou. Agora identifique cada câmera com um
              nome que faça sentido no dia a dia.
            </p>
          </div>
        </header>

        {query.error ? <div className={styles.error}>{query.error}</div> : null}

        <form action={saveDiscoveredCameraNamesAction} className={styles.form}>
          <div className={styles.grid}>
            {cameras.map((camera, index) => (
              <article className={styles.card} key={camera.id}>
                <div className={styles.number}>{index + 1}</div>
                <div className={styles.info}>
                  <span>{camera.status === "online" ? "CÂMERA CONECTADA" : "CÂMERA ENCONTRADA"}</span>
                  <strong>{camera.stream_label || camera.name || `Câmera ${index + 1}`}</strong>
                  <small>
                    Use algo fácil de reconhecer: Entrada, Caixa, Estoque,
                    Corredor 1...
                  </small>
                </div>
                <label>
                  <span>Como deseja chamar esta câmera?</span>
                  <input
                    type="text"
                    name={`camera_${camera.id}`}
                    placeholder={index === 0 ? "Ex.: Entrada da loja" : `Ex.: Câmera ${index + 1}`}
                    minLength={2}
                    maxLength={160}
                    required
                  />
                </label>
              </article>
            ))}
          </div>

          <div className={styles.notice}>
            <strong>Nenhum plano foi ativado ainda.</strong>
            <span>
              Depois de salvar os nomes, você escolherá entre testar gratuitamente
              por 24 horas ou contratar um plano.
            </span>
          </div>

          <button className={styles.primary} type="submit">
            Salvar nomes e continuar
          </button>
        </form>
      </section>
    </main>
  );
}
