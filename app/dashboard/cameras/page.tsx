import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization, getOrganizationCameras, getOrganizationSites } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";

export const metadata = { title: "Câmeras" };
export const dynamic = "force-dynamic";

const planLabels: Record<string, string> = {
  basic: "Básico",
  standard: "Padrão",
  intensive: "Intensivo",
};

const pairingLabels: Record<string, string> = {
  unpaired: "Sem Agent",
  pairing: "Aguardando pareamento",
  paired: "Pareada",
};

export default async function CamerasPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const [sites, cameras] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
  ]);

  if (!sites.length) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="cameras" />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">CÂMERAS · {organization.name.toUpperCase()}</span>
            <h1>Fontes visuais do MonitorIA</h1>
            <p>Cadastre as câmeras e conecte cada uma a um Agent instalado no local.</p>
          </div>
          <Link href="/dashboard/cameras/new" className="panel-primary-action">Adicionar câmera</Link>
        </header>

        {cameras.length ? (
          <div className="camera-list-grid">
            {cameras.map((camera) => (
              <Link href={`/dashboard/cameras/${camera.id}`} className="camera-list-card" key={camera.id}>
                <div className="camera-card-preview">
                  <img src="/favicon.svg" alt="" />
                  <span>{camera.status === "online" ? "ONLINE" : "AGUARDANDO AGENT"}</span>
                </div>
                <div className="camera-card-body">
                  <div>
                    <span>{camera.siteName}</span>
                    <h2>{camera.name}</h2>
                  </div>
                  <p>{camera.description || "Descrição do ambiente ainda não informada."}</p>
                  <dl>
                    <div><dt>Plano</dt><dd>{planLabels[camera.planCode] ?? camera.planCode}</dd></div>
                    <div><dt>Consolidação</dt><dd>{camera.consolidationIntervalSeconds}s</dd></div>
                    <div><dt>Pareamento</dt><dd>{pairingLabels[camera.pairingStatus] ?? camera.pairingStatus}</dd></div>
                  </dl>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="camera-empty-state">
            <div className="camera-empty-icon">◉</div>
            <span>PRIMEIRA CÂMERA</span>
            <h2>Conecte a primeira fonte visual</h2>
            <p>O cadastro leva menos de um minuto. A URL RTSP será solicitada apenas pelo Agent local na próxima etapa.</p>
            <Link href="/dashboard/cameras/new" className="panel-primary-action">Cadastrar câmera</Link>
          </section>
        )}
      </section>
    </main>
  );
}
