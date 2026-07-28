import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization, getOrganizationSites } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { CameraSetupForm } from "../camera-setup-form";

export const metadata = { title: "Adicionar câmera" };
export const dynamic = "force-dynamic";

export default async function NewCameraPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const sites = await getOrganizationSites(organization.id);
  if (!sites.length) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="cameras" />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">NOVA CÂMERA</span>
            <h1>Prepare a fonte visual</h1>
            <p>Defina o local, o nível de precisão e os objetivos iniciais de monitoramento.</p>
          </div>
          <Link href="/dashboard/cameras" className="back-link">← Voltar às câmeras</Link>
        </header>

        <section className="camera-form-card">
          <div className="camera-form-intro">
            <span>ETAPA 1 DE 3</span>
            <h2>Cadastro e código do Agent</h2>
            <p>Depois desta tela, o Agent testará o RTSP, capturará o primeiro frame e iniciará a configuração visual do ambiente.</p>
          </div>
          <CameraSetupForm sites={sites} />
        </section>
      </section>
    </main>
  );
}
