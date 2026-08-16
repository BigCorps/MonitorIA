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
import { OnboardingContextGate } from "./onboarding-context-gate";
import { CameraConnectionControl } from "./camera-connection-control";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const planLabels: Record<string, string> = {
  basic: "Essencial",
  standard: "Atenta",
  intensive: "Detalhada",
};

const pairingLabels: Record<string, string> = {
  unpaired: "Sem computador conectado",
  pairing: "Conectando",
  paired: "Conectada",
};

type Props = {
  params: Promise<{ cameraId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function queryValue(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function CameraDetailPage({ params, searchParams }: Props) {
  const [{ cameraId }, query] = await Promise.all([params, searchParams]);
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  const [camera, profileWorkspace] = await Promise.all([
    getOrganizationCamera(organization.id, cameraId),
    getCameraProfileWorkspace(organization.id, cameraId),
  ]);

  if (!camera) notFound();

  const canManage = ["owner", "admin"].includes(organization.role);
  const onboarding = query.onboarding === "1";
  const profileReady = Boolean(profileWorkspace.latestProfile?.isActive);
  const hasFrame = Boolean(
    profileWorkspace.frame || profileWorkspace.referenceFrames.length,
  );
  const connectionEnabled = camera.status !== "disabled";

  if (onboarding) {
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
                PRIMEIRO ACESSO · PASSO 4 DE 5
              </span>
              <h1>Configure o contexto de {camera.name}</h1>
              <p>
                Primeiro aguardamos uma imagem real. Depois você explica o
                ambiente e, ao aprovar, segue automaticamente para escolher
                entre teste grátis e contratação.
              </p>
            </div>

            <Link href="/dashboard" className="back-link">
              ← Voltar ao primeiro acesso
            </Link>
          </header>

          <OnboardingContextGate
            cameraName={camera.name}
            hasFrame={hasFrame}
            profileReady={profileReady}
          />

          {hasFrame && !profileReady ? (
            <CameraProfilePanel
              cameraId={camera.id}
              cameraStatus={camera.status}
              canManage={canManage}
              workspace={profileWorkspace}
            />
          ) : null}
        </section>
      </main>
    );
  }

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
                "A descrição será aprimorada após a primeira imagem."}
            </p>
          </div>

          <Link href="/dashboard/cameras" className="back-link">
            ← Voltar às câmeras
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        {queryValue(query.connection) === "disabled" ? (
          <div
            style={{
              margin: "0 0 18px",
              padding: "12px 14px",
              border: "1px solid #d9e0e8",
              borderRadius: "10px",
              background: "#f7f8fa",
              color: "#536274",
              fontSize: "11px",
              fontWeight: 750,
            }}
          >
            Câmera desconectada. O cadastro e o histórico foram preservados.
          </div>
        ) : null}

        {queryValue(query.connection) === "enabled" ? (
          <div
            style={{
              margin: "0 0 18px",
              padding: "12px 14px",
              border: "1px solid #bde8dc",
              borderRadius: "10px",
              background: "#edf9f5",
              color: "#08745f",
              fontSize: "11px",
              fontWeight: 750,
            }}
          >
            Câmera reconectada. Ela voltará a aparecer no Agent e ficará online
            assim que a leitura for retomada.
          </div>
        ) : null}

        {queryValue(query.connection_error) ? (
          <div
            style={{
              margin: "0 0 18px",
              padding: "12px 14px",
              border: "1px solid #f0c7c7",
              borderRadius: "10px",
              background: "#fff5f5",
              color: "#a43737",
              fontSize: "11px",
              fontWeight: 750,
            }}
          >
            Não foi possível alterar a conexão desta câmera. Tente novamente.
          </div>
        ) : null}

        <div className="camera-detail-grid">
          <section className="camera-detail-card">
            <div className="panel-title-row">
              <div>
                <span>CONFIGURAÇÃO</span>
                <h2>Configurações atuais</h2>
              </div>

              <span className="status-chip">
                {connectionEnabled
                  ? pairingLabels[camera.pairingStatus] ?? camera.pairingStatus
                  : "Desconectada"}
              </span>
            </div>

            <dl className="camera-detail-list">
              <div><dt>Local</dt><dd>{camera.siteName}</dd></div>
              <div><dt>Plano</dt><dd>{planLabels[camera.planCode] ?? camera.planCode}</dd></div>
              <div><dt>Frequência de observação</dt><dd>{camera.captureIntervalSeconds}s</dd></div>
              <div><dt>Intervalo do resumo</dt><dd>{camera.consolidationIntervalSeconds}s</dd></div>
              <div>
                <dt>Status da câmera</dt>
                <dd>{connectionEnabled ? camera.status : "desconectada"}</dd>
              </div>
            </dl>

            <div className="camera-goals-list">
              <span>OBJETIVOS ATUAIS</span>
              {camera.monitoringGoals.length ? (
                <ul>
                  {camera.monitoringGoals.map((goal: string) => (
                    <li key={goal}>{goal}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum objetivo específico informado.</p>
              )}
            </div>
          </section>

          <section className="camera-detail-card pairing-card">
            <div className="panel-title-row">
              <div>
                <span>CONEXÃO LOCAL</span>
                <h2>Conexão segura</h2>
              </div>

              <span
                className={
                  camera.pairingStatus === "paired" && connectionEnabled
                    ? "online-chip"
                    : "status-chip"
                }
              >
                {camera.pairingStatus === "paired" && connectionEnabled
                  ? <i />
                  : null}
                {!connectionEnabled
                  ? "Desconectada"
                  : pairingLabels[camera.pairingStatus] ?? camera.pairingStatus}
              </span>
            </div>

            <PairingCodeGenerator
              cameraId={camera.id}
              paired={camera.pairingStatus === "paired"}
            />

            <CameraConnectionControl
              cameraId={camera.id}
              cameraName={camera.name}
              paired={camera.pairingStatus === "paired"}
              enabled={connectionEnabled}
              canManage={canManage}
            />
          </section>
        </div>

        <MonitoringSettings camera={camera} canManage={canManage} />

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
