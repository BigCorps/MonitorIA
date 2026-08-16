import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import styles from "./cameras.module.css";

import { DashboardSectionTabs } from "../dashboard-section-tabs";

export const metadata = { title: "Câmeras" };
export const dynamic = "force-dynamic";

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
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className="dashboard-content camera-dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERAS · {organization.name.toUpperCase()}
            </span>
            <h1>Câmeras do MonitorIA</h1>
            <p>
              Veja cada câmera, sua imagem de referência e o estado da conexão.
              Abra uma câmera para desconectar ou reconectar o monitoramento
              sem apagar o histórico.
            </p>
          </div>

          <Link
            href="/dashboard/cameras/discovery"
            className="panel-primary-action"
          >
            Procurar câmeras
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        {cameras.length ? (
          <div className="camera-list-grid">
            {cameras.map((camera) => (
              <Link
                href={`/dashboard/cameras/${camera.id}`}
                className="camera-list-card"
                key={camera.id}
              >
                <div className={`camera-card-preview ${styles.preview}`}>
                  {camera.thumbnailAssetId ? (
                    <img
                      className={styles.thumbnail}
                      src={`/api/storage-assets/${camera.thumbnailAssetId}`}
                      alt={`Imagem de referência da câmera ${camera.name}`}
                    />
                  ) : (
                    <img className={styles.logo} src="/favicon.svg" alt="" />
                  )}

                  <span
                    className={
                      camera.status === "online"
                        ? styles.statusOnline
                        : undefined
                    }
                  >
                    {camera.status === "disabled"
                      ? "DESATIVADA"
                      : camera.status === "online"
                        ? "ONLINE"
                        : "AGUARDANDO CONEXÃO"}
                  </span>
                </div>

                <div className="camera-card-body">
                  <div>
                    <span>{camera.siteName}</span>
                    <h2>{camera.name}</h2>
                  </div>

                  <p>
                    {camera.description ||
                      "Descrição do ambiente ainda não informada."}
                  </p>

                  <dl>
                    <div>
                      <dt>Plano</dt>
                      <dd>{planLabels[camera.planCode] ?? camera.planCode}</dd>
                    </div>
                    <div>
                      <dt>Intervalo de análise</dt>
                      <dd>{camera.consolidationIntervalSeconds}s</dd>
                    </div>
                    <div>
                      <dt>Conexão</dt>
                      <dd>
                        {camera.status === "disabled"
                          ? "Desconectada"
                          : pairingLabels[camera.pairingStatus] ??
                            camera.pairingStatus}
                      </dd>
                    </div>
                  </dl>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <section className="camera-empty-state">
            <div className="camera-empty-icon">◉</div>
            <span>PRIMEIRA CÂMERA</span>
            <h2>Conecte a primeira câmera</h2>
            <p>
              O cadastro leva menos de um minuto. As informações de acesso serão
              solicitadas somente no computador instalado.
            </p>
            <Link
              href="/dashboard/cameras/new"
              className="panel-primary-action"
            >
              Cadastrar câmera
            </Link>
          </section>
        )}
      </section>
    </main>
  );
}
