import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCamera,
} from "@/src/lib/dashboard-data";
import { getCameraProfileWorkspace } from "@/src/lib/camera-profile-data";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { PairingCodeGenerator } from "../pairing-code-generator";
import { CameraProfilePanel } from "./camera-profile-panel";
import { MonitoringSettings } from "./monitoring-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const planLabels: Record<string, string> = {
  basic: "Essencial",
  standard: "Atenta",
  intensive: "Detalhada",
};

const pairingLabels: Record<string, string> = {
  unpaired: "Sem Agent",
  pairing: "Aguardando pareamento",
  paired: "Pareada",
};

type Props = {
  params: Promise<{ cameraId: string }>;
};

export default async function CameraDetailPage({
  params,
}: Props) {
  const { cameraId } = await params;
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [camera, profileWorkspace] = await Promise.all([
    getOrganizationCamera(organization.id, cameraId),
    getCameraProfileWorkspace(organization.id, cameraId),
  ]);

  if (!camera) notFound();

  const canManage = ["owner", "admin"].includes(
    organization.role,
  );

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERA · {camera.siteName.toUpperCase()}
            </span>
            <h1>{camera.name}</h1>
            <p>
              {camera.description ||
                "A descrição visual será aprimorada após o primeiro frame."}
            </p>
          </div>

          <Link href="/dashboard/cameras" className="back-link">
            ← Voltar às câmeras
          </Link>
        </header>

        <div className="camera-detail-grid">
          <section className="camera-detail-card">
            <div className="panel-title-row">
              <div>
                <span>CONFIGURAÇÃO</span>
                <h2>Parâmetros atuais</h2>
              </div>

              <span className="status-chip">
                {pairingLabels[camera.pairingStatus] ??
                  camera.pairingStatus}
              </span>
            </div>

            <dl className="camera-detail-list">
              <div>
                <dt>Local</dt>
                <dd>{camera.siteName}</dd>
              </div>
              <div>
                <dt>Plano configurado</dt>
                <dd>
                  {planLabels[camera.planCode] ??
                    camera.planCode}
                </dd>
              </div>
              <div>
                <dt>Observação local</dt>
                <dd>{camera.captureIntervalSeconds}s</dd>
              </div>
              <div>
                <dt>Consolidação</dt>
                <dd>
                  {camera.consolidationIntervalSeconds}s
                </dd>
              </div>
              <div>
                <dt>Status da câmera</dt>
                <dd>{camera.status}</dd>
              </div>
            </dl>

            <div className="camera-goals-list">
              <span>OBJETIVOS ATUAIS</span>
              {camera.monitoringGoals.length ? (
                <ul>
                  {camera.monitoringGoals.map(
                    (goal: string) => (
                      <li key={goal}>{goal}</li>
                    ),
                  )}
                </ul>
              ) : (
                <p>
                  Nenhum objetivo específico informado.
                </p>
              )}
            </div>
          </section>

          <section className="camera-detail-card pairing-card">
            <div className="panel-title-row">
              <div>
                <span>AGENT LOCAL</span>
                <h2>Pareamento seguro</h2>
              </div>

              <span
                className={
                  camera.pairingStatus === "paired"
                    ? "online-chip"
                    : "status-chip"
                }
              >
                {camera.pairingStatus === "paired" ? (
                  <i />
                ) : null}
                {pairingLabels[camera.pairingStatus] ??
                  camera.pairingStatus}
              </span>
            </div>

            <PairingCodeGenerator
              cameraId={camera.id}
              paired={camera.pairingStatus === "paired"}
            />
          </section>
        </div>

        <MonitoringSettings
          camera={camera}
          canManage={canManage}
        />

        <CameraProfilePanel
          cameraId={camera.id}
          cameraStatus={camera.status}
          canManage={canManage}
          workspace={profileWorkspace}
        />
      </section>
    </main>
  );
}
