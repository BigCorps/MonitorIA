import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { DashboardSectionTabs } from "../../dashboard-section-tabs";
import styles from "./connections.module.css";

export const metadata = {
  title: "Como conectar câmeras",
};
export const dynamic = "force-dynamic";

const sourceTypes = [
  {
    title: "Câmera IP",
    badge: "RTSP / ONVIF",
    description:
      "Use a transmissão local da câmera. O Agent acessa a fonte dentro da rede e mantém usuário e senha no computador instalado.",
    steps: [
      "Confirme o endereço IP da câmera.",
      "Ative RTSP ou ONVIF no equipamento.",
      "Cadastre a câmera e informe a URL somente no Agent.",
    ],
  },
  {
    title: "DVR ou NVR",
    badge: "Analógica ou IP",
    description:
      "Câmeras analógicas podem chegar ao MonitorIA pelos canais do DVR. Em NVRs, cada canal costuma ter uma URL própria.",
    steps: [
      "Localize o IP do gravador.",
      "Escolha o canal que será monitorado.",
      "Use a URL RTSP correspondente ao canal.",
    ],
  },
  {
    title: "Câmera de aplicativo",
    badge: "Depende do fabricante",
    description:
      "Alguns aplicativos escondem a transmissão. Verifique se o fabricante oferece RTSP, ONVIF, modo local ou um gateway compatível.",
    steps: [
      "Procure RTSP, ONVIF ou modo LAN no aplicativo.",
      "Consulte o manual do modelo exato.",
      "Quando não houver transmissão local, fale com o suporte MonitorIA.",
    ],
  },
] as const;

export default async function CameraConnectionsPage() {
  const user = await requireAuthenticatedUser();
  const organization =
    await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section
        className={`dashboard-content ${styles.content}`}
      >
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERAS · {organization.name.toUpperCase()}
            </span>
            <h1>Como conectar cada tipo de câmera</h1>
            <p>
              Identifique a origem do vídeo, cadastre a câmera
              e conecte o Agent sem expor credenciais RTSP no
              navegador.
            </p>
          </div>

          <Link
            className="panel-primary-action"
            href="/dashboard/cameras/new"
          >
            Adicionar câmera
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <section className={styles.flow}>
          <span>FLUXO RECOMENDADO</span>
          <div>
            <article>
              <strong>1</strong>
              <p>Identifique a fonte e o canal.</p>
            </article>
            <article>
              <strong>2</strong>
              <p>Cadastre nome, local e objetivo.</p>
            </article>
            <article>
              <strong>3</strong>
              <p>Instale o Agent na mesma rede.</p>
            </article>
            <article>
              <strong>4</strong>
              <p>Pareie, informe o RTSP e teste.</p>
            </article>
          </div>
        </section>

        <div className={styles.grid}>
          {sourceTypes.map((source) => (
            <article className={styles.card} key={source.title}>
              <header>
                <div>
                  <span>TIPO DE FONTE</span>
                  <h2>{source.title}</h2>
                </div>
                <strong>{source.badge}</strong>
              </header>
              <p>{source.description}</p>
              <ol>
                {source.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>

        <section className={styles.helpCard}>
          <div>
            <span>NÃO ENCONTRO RTSP OU ONVIF</span>
            <h2>O modelo pode exigir uma ponte local.</h2>
            <p>
              Envie fabricante e modelo para o suporte antes de
              comprar conversores ou trocar equipamentos. A
              compatibilidade depende do recurso disponibilizado
              pelo fabricante.
            </p>
          </div>

          <div>
            <Link href="/dashboard/installer">
              Instalar ou diagnosticar o Agent
            </Link>
            <Link href="/dashboard/cameras">
              Ver câmeras cadastradas
            </Link>
          </div>
        </section>
      </section>
    </main>
  );
}
