import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import { SitePairingCode } from "../../site-pairing-code";
import styles from "./pair.module.css";

export const metadata = { title: "Parear computador" };
export const dynamic = "force-dynamic";

export default async function PairComputerPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    redirect("/onboarding");
  }

  if (!["owner", "admin"].includes(organization.role)) {
    redirect("/dashboard/installer");
  }

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="installer"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              INSTALAÇÃO · {organization.name.toUpperCase()}
            </span>
            <h1>Conectar ou trocar o computador</h1>
            <p>
              Gere um novo código quando uma instalação nova pedir pareamento,
              quando trocar de computador ou quando alternar entre MonitorIA
              24/7 e Microsoft Store.
            </p>
          </div>

          <Link href="/dashboard/installer" className="panel-secondary-action">
            Voltar para Instalação
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <section className={styles.card}>
          <div className={styles.heading}>
            <span>CÓDIGO POR LOCAL</span>
            <h2>Um código conecta este computador ao local inteiro</h2>
            <p>
              O código vale 15 minutos, só pode ser usado uma vez e não contém
              senha de câmera. Depois do pareamento, o MonitorIA localiza ou
              reassocia as câmeras deste local pelo fluxo normal de descoberta.
            </p>
          </div>

          <div className={styles.warning}>
            <strong>Antes de usar um novo código</strong>
            <p>
              Pare a edição antiga do MonitorIA neste computador. Ao consumir o
              novo código, o computador anterior deste local é desativado no
              painel para impedir dois Agents concorrendo pelas mesmas câmeras.
            </p>
          </div>

          <ol className={styles.steps}>
            <li>
              <span>1</span>
              <div>
                <strong>Abra a nova instalação</strong>
                <p>
                  Deixe a tela “Conectar este computador ao MonitorIA” aberta.
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Pare a instalação anterior</strong>
                <p>
                  Se estiver trocando de edição, encerre ou pare o MonitorIA
                  anterior antes de consumir o código.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Gere e informe o código abaixo</strong>
                <p>
                  Um código novo revoga qualquer código ainda não usado para
                  este mesmo local.
                </p>
              </div>
            </li>
          </ol>

          <div className={styles.generator}>
            <SitePairingCode />
          </div>
        </section>
      </section>
    </main>
  );
}
