import type { ReactNode } from "react";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import type { DashboardSection } from "../dashboard-sidebar";

type Props = {
  organizationName: string;
  userEmail: string | null;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
  active?: DashboardSection;
};

/**
 * Base recomendada para as próximas fases de inteligência.
 *
 * O módulo recebe automaticamente:
 * - sidebar consolidada;
 * - abas principais de Monitoramento;
 * - abas secundárias de Inteligência;
 * - estrutura de cabeçalho consistente.
 */
export function IntelligencePageFrame({
  organizationName,
  userEmail,
  eyebrow,
  title,
  description,
  children,
  actions,
  active = "intelligence",
}: Props) {
  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organizationName}
        userEmail={userEmail}
        active={active}
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              {eyebrow}
            </span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions}
        </header>

        <DashboardSectionTabs group="monitoring" />
        <DashboardSectionTabs
          group="intelligence"
          density="compact"
        />

        {children}
      </section>
    </main>
  );
}
