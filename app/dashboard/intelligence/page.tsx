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
    title: "Rotinas e desvios",
    description:
      "Faixas habituais, atrasos, antecipações e diferenças em relação ao histórico visual.",
    href: "/dashboard/routines",
  },
  {
    eyebrow: "ETAPAS",
    title: "Processos e ações",
    description:
      "Sequências observadas, etapas confirmadas, pendências e resultados visuais.",
    href: "/dashboard/processes",
  },
  {
    eyebrow: "MEMÓRIA OPERACIONAL",
    title: "Perfis operacionais",
    description:
      "Padrões aprovados de presença, zonas, turnos e ações recorrentes, sem biometria.",
    href: "/dashboard/operational-profiles",
  },
] as const;

export default async function IntelligencePage() {
  const user = await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="intelligence"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INTELIGÊNCIA ·{" "}
              {organization.name.toUpperCase()}
            </span>
            <h1>Padrões e processos observados</h1>
            <p>
              Toda nova fase de inteligência entra nesta área,
              sem criar novas opções no menu principal.
            </p>
          </div>

          <Link
            className="panel-primary-action"
            href="/dashboard/search"
          >
            Perguntar à Pesquisa IA
          </Link>
        </header>

        <DashboardSectionTabs group="monitoring" />
        <DashboardSectionTabs
          group="intelligence"
          density="compact"
        />

        <section className={styles.intro}>
          <div>
            <span>LEITURA CONSERVADORA</span>
            <h2>
              O MonitorIA organiza evidências, não atribui
              intenção.
            </h2>
          </div>
          <p>
            Rotinas, desvios, processos e perfis são derivados
            do histórico visual autorizado e permanecem
            separados de reconhecimento facial ou identidade
            civil.
          </p>
        </section>

        <div className={styles.grid}>
          {modules.map((module) => (
            <Link
              className={styles.card}
              href={module.href}
              key={module.href}
            >
              <span>{module.eyebrow}</span>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
              <strong>Abrir módulo →</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
