import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { IntegrationRequestForm } from "./integration-request-form";
import styles from "./integration-request.module.css";

export const metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="integrations"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">INTEGRAÇÕES</span>
            <h1>Conecte o MonitorIA à sua operação</h1>
            <p>
              Use assistentes de IA que sua equipe já conhece ou solicite uma
              avaliação para cruzar as câmeras com PDVs, delivery, ERPs e
              plataformas de mercados autônomos.
            </p>
          </div>
        </header>

        <section className={styles.integrationHub}>
          <article className={styles.hubCard}>
            <div className={styles.hubIcon} aria-hidden="true">↗</div>
            <div>
              <span>IA E ASSISTENTES</span>
              <h2>ChatGPT, Claude, Cursor e outros clientes MCP</h2>
              <p>
                A área MCP existente continua separada e intacta. Use-a para
                conectar, diagnosticar e revogar acessos dos seus assistentes.
              </p>
            </div>
            <Link href="/dashboard/profile/mcp-connections">
              Abrir conexões MCP
            </Link>
          </article>

          <article className={styles.hubCard}>
            <div className={styles.hubIcon} aria-hidden="true">◎</div>
            <div>
              <span>SISTEMAS DA OPERAÇÃO</span>
              <h2>PDV, delivery, ERP e mercado autônomo</h2>
              <p>
                Solicite a avaliação de sistemas que possam fornecer vendas,
                pedidos, cancelamentos e outros registros para conciliação com
                os acontecimentos observados pelas câmeras.
              </p>
            </div>
            <a href="#solicitar-integracao">Solicitar avaliação</a>
          </article>
        </section>

        <section className={styles.lossPreview}>
          <div>
            <span>PREVENÇÃO DE PERDAS · EM EXPANSÃO</span>
            <h2>O que aconteceu × o que foi registrado</h2>
            <p>
              O MonitorIA pode evoluir a análise das câmeras cruzando
              acontecimentos visuais com vendas, pedidos, cancelamentos e outros
              registros do sistema que sua empresa já utiliza — sem exigir a
              troca do PDV.
            </p>
          </div>
          <div className={styles.lossFlow} aria-label="Exemplos de conciliação">
            <span>Câmera + venda registrada</span>
            <span>Divergência + horário</span>
            <span>Relatório + evidência visual</span>
          </div>
        </section>

        <IntegrationRequestForm />
      </section>
    </main>
  );
}
