import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import styles from "./intelligence.module.css";

export const metadata = { title: "Inteligência" };
export const dynamic = "force-dynamic";

const modules = [
  {
    eyebrow: "PADRÕES",
    title: "Rotinas e diferenças",
    description:
      "Horários habituais e mudanças em relação ao que costuma acontecer.",
    href: "/dashboard/routines",
  },
  {
    eyebrow: "ETAPAS",
    title: "Processos e etapas",
    description: "Etapas observadas, concluídas, pendentes e seus resultados.",
    href: "/dashboard/processes",
  },
  {
    eyebrow: "PADRÕES DA OPERAÇÃO",
    title: "Padrões da operação",
    description:
      "Padrões revisados de horários, locais e atividades recorrentes.",
    href: "/dashboard/operational-profiles",
  },
] as const;

export default async function IntelligencePage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="intelligence"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INTELIGÊNCIA · {organization.name.toUpperCase()}
            </span>
            <h1>Padrões e processos observados</h1>
            <p>
              Veja rotinas, mudanças e etapas identificadas a partir dos
              acontecimentos registrados.
            </p>
          </div>

          <Link className="panel-primary-action" href="/dashboard/search">
            Perguntar à Pesquisa IA
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />

        <section className={styles.intro}>
          <div>
            <span>ANÁLISE RESPONSÁVEL</span>
            <h2>
              O MonitorIA organiza o que foi observado sem tirar conclusões
              sobre intenções.
            </h2>
          </div>
          <p>
            As análises usam somente o histórico autorizado e não identificam
            pessoas por rosto, biometria ou documentos.
          </p>
        </section>

        <div className={styles.grid}>
          {modules.map((module) => (
            <Link className={styles.card} href={module.href} key={module.href}>
              <span>{module.eyebrow}</span>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
              <strong>Abrir →</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
