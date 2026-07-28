import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization, getOrganizationCamera } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { PairingCodeGenerator } from "../pairing-code-generator";

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

type Props = { params: Promise<{ cameraId: string }> };

export default async function CameraDetailPage({ params }: Props) {
  const { cameraId } = await params;
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const camera = await getOrganizationCamera(organization.id, cameraId);
  if (!camera) notFound();

  return (
    <main className="dashboard-shell">
      <DashboardSidebar organizationName={organization.name} userEmail={user.email} active="cameras" />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">CÂMERA · {camera.siteName.toUpperCase()}</span>
            <h1>{camera.name}</h1>
            <p>{camera.description || "A descrição visual será aprimorada após o primeiro frame."}</p>
          </div>
          <Link href="/dashboard/cameras" className="back-link">← Voltar às câmeras</Link>
        </header>

        <div className="camera-detail-grid">
          <section className="camera-detail-card">
            <div className="panel-title-row">
              <div><span>CONFIGURAÇÃO</span><h2>Parâmetros atuais</h2></div>
              <span className="status-chip">{pairingLabels[camera.pairingStatus] ?? camera.pairingStatus}</span>
            </div>

            <dl className="camera-detail-list">
              <div><dt>Local</dt><dd>{camera.siteName}</dd></div>
              <div><dt>Plano</dt><dd>{planLabels[camera.planCode] ?? camera.planCode}</dd></div>
              <div><dt>Observação local</dt><dd>{camera.captureIntervalSeconds}s</dd></div>
              <div><dt>Consolidação</dt><dd>{camera.consolidationIntervalSeconds}s</dd></div>
              <div><dt>Status da câmera</dt><dd>{camera.status}</dd></div>
            </dl>

            <div className="camera-goals-list">
              <span>OBJETIVOS INICIAIS</span>
              {camera.monitoringGoals.length ? (
                <ul>{camera.monitoringGoals.map((goal) => <li key={goal}>{goal}</li>)}</ul>
              ) : (
                <p>Nenhum objetivo específico informado. A configuração poderá ser feita após o primeiro frame.</p>
              )}
            </div>
          </section>

          <section className="camera-detail-card pairing-card">
            <div className="panel-title-row">
              <div><span>AGENT LOCAL</span><h2>Pareamento seguro</h2></div>
              <span className={camera.pairingStatus === "paired" ? "online-chip" : "status-chip"}>
                {camera.pairingStatus === "paired" ? <i /> : null}
                {pairingLabels[camera.pairingStatus] ?? camera.pairingStatus}
              </span>
            </div>
            <PairingCodeGenerator cameraId={camera.id} paired={camera.pairingStatus === "paired"} />
          </section>
        </div>

        <section className="agent-next-step-card">
          <span>PRÓXIMA ENTREGA</span>
          <h2>MonitorIA Agent para Windows</h2>
          <p>O executável receberá o código acima, solicitará a URL RTSP localmente, testará o FFmpeg e enviará o primeiro heartbeat.</p>
          <div>
            <code>POST /api/agent/pair</code>
            <code>POST /api/agent/heartbeat</code>
            <code>GET /api/agent/config</code>
          </div>
        </section>
      </section>
    </main>
  );
}
