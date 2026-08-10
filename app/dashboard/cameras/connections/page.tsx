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
    badge: "Conexão pela rede",
    description:
      "O MonitorIA acessa a câmera pela rede local. O usuário e a senha ficam guardados no computador instalado; ao usar a busca pelo painel, a senha serve apenas para conectar e é descartada em seguida.",
    steps: [
      "Encontre o endereço da câmera na rede.",
      "Ative a transmissão local nas configurações da câmera.",
      "Cadastre a câmera e conclua a conexão no computador instalado.",
    ],
  },
  {
    title: "Gravador (DVR ou NVR)",
    badge: "Gravador de câmeras",
    description:
      "Use o endereço do gravador e escolha qual canal de câmera será monitorado.",
    steps: [
      "Encontre o endereço do gravador na rede.",
      "Escolha o canal que será monitorado.",
      "Informe ao MonitorIA o endereço de transmissão desse canal.",
    ],
  },
  {
    title: "Câmera de aplicativo",
    badge: "Consulte o fabricante",
    description:
      "Algumas câmeras funcionam apenas pelo aplicativo do fabricante. Verifique se existe uma opção de acesso pela rede local.",
    steps: [
      "Procure por “acesso local”, “RTSP” ou “ONVIF” nas configurações.",
      "Consulte o manual do modelo exato.",
      "Se não encontrar essa opção, fale com o suporte MonitorIA.",
    ],
  },
] as const;

export default async function CameraConnectionsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              CÂMERAS · {organization.name.toUpperCase()}
            </span>
            <h1>Como conectar cada tipo de câmera</h1>
            <p>
              Escolha de onde vem a imagem, cadastre a câmera e conclua a
              conexão. As informações de acesso ficam protegidas e não aparecem
              no navegador.
            </p>
          </div>

          <Link className="panel-primary-action" href="/dashboard/cameras/new">
            Adicionar câmera
          </Link>
        </header>

        <DashboardSectionTabs group="cameras" />

        <section className={styles.flow}>
          <span>FLUXO RECOMENDADO</span>
          <div>
            <article>
              <strong>1</strong>
              <p>Identifique a câmera ou o gravador.</p>
            </article>
            <article>
              <strong>2</strong>
              <p>Cadastre nome, local e objetivo.</p>
            </article>
            <article>
              <strong>3</strong>
              <p>Instale o MonitorIA em um computador da mesma rede.</p>
            </article>
            <article>
              <strong>4</strong>
              <p>Conecte e teste a imagem.</p>
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
            <span>NÃO CONSIGO CONECTAR A CÂMERA</span>
            <h2>Alguns modelos precisam de uma configuração adicional.</h2>
            <p>
              Envie o fabricante e o modelo para o suporte antes de comprar
              conversores ou trocar equipamentos. A equipe verificará a melhor
              forma de conexão disponível.
            </p>
          </div>

          <div>
            <Link href="/dashboard/installer">
              Instalar ou verificar o MonitorIA
            </Link>
            <Link href="/dashboard/cameras">Ver câmeras cadastradas</Link>
          </div>
        </section>
      </section>
    </main>
  );
}
