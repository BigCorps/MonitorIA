import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { appConfig } from "@/src/lib/app-config";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { DashboardSectionTabs } from "../dashboard-section-tabs";
import styles from "./support.module.css";

export const metadata = { title: "Ajuda e suporte | MonitorIA" };
export const dynamic = "force-dynamic";

const helpItems = [
  {
    title: "Uma câmera parou de enviar imagens",
    description:
      "Veja se a câmera está online e confira quando o MonitorIA recebeu a última imagem.",
    href: "/dashboard/camera-health",
    action: "Ver funcionamento",
  },
  {
    title: "O computador do MonitorIA está sem comunicação",
    description:
      "Confira a instalação no computador responsável por conectar suas câmeras ao MonitorIA.",
    href: "/dashboard/installer",
    action: "Ver instalação",
  },
  {
    title: "A imagem está escura, desfocada ou fora de posição",
    description:
      "Confira a recomendação da câmera e, se a posição mudou de propósito, atualize a referência visual.",
    href: "/dashboard/camera-health",
    action: "Ver câmeras",
  },
  {
    title: "Quero entender um alerta",
    description:
      "Abra a caixa de alertas para ver o que foi detectado, a recomendação e o registro relacionado.",
    href: "/dashboard/operations",
    action: "Abrir alertas",
  },
  {
    title: "A Pesquisa IA não respondeu como esperado",
    description:
      "Tente novamente e confira se existem acontecimentos no período pesquisado. Se continuar, fale com o suporte.",
    href: "/dashboard/search",
    action: "Abrir Pesquisa IA",
  },
  {
    title: "Preciso conferir plano ou pagamento",
    description:
      "Veja as câmeras ativas, o plano atual e as informações de cobrança da sua conta.",
    href: "/dashboard/plans",
    action: "Ver plano e cobrança",
  },
] as const;

export default async function SupportPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="profile"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              SUPORTE · {organization.name.toUpperCase()}
            </span>
            <h1>Ajuda e suporte</h1>
            <p>
              Encontre rapidamente o que fazer nas situações mais comuns ou
              fale com nossa equipe quando precisar.
            </p>
          </div>
          <a
            className="panel-primary-action"
            href={appConfig.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Falar no WhatsApp
          </a>
        </header>

        <DashboardSectionTabs group="settings" />

        <section className={styles.intro}>
          <div>
            <span>AJUDA RÁPIDA</span>
            <h2>O que você precisa resolver?</h2>
            <p>
              Escolha uma situação abaixo para ir direto à página mais útil do
              dashboard.
            </p>
          </div>
          <Link href="/ajuda">Abrir central de ajuda</Link>
        </section>

        <section className={styles.helpGrid} aria-label="Ajuda rápida">
          {helpItems.map((item) => (
            <article className={styles.helpCard} key={item.title}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <Link href={item.href}>{item.action}</Link>
            </article>
          ))}
        </section>

        <section className={styles.linksSection}>
          <div className={styles.sectionHeading}>
            <span>OUTROS CAMINHOS</span>
            <h2>Informações úteis</h2>
          </div>
          <div className={styles.linkCards}>
            <Link href="/ajuda">
              <strong>Central de ajuda</strong>
              <span>Guias de instalação, conexão e uso do MonitorIA.</span>
            </Link>
            <Link href="/status">
              <strong>Status dos serviços</strong>
              <span>Confira se existe alguma indisponibilidade conhecida.</span>
            </Link>
            <Link href="/dashboard/cameras/connections">
              <strong>Como conectar câmeras</strong>
              <span>Veja orientações para câmera IP e gravadores de câmeras.</span>
            </Link>
          </div>
        </section>

        <section className={styles.supportInfo}>
          <div>
            <span>QUANDO O SUPORTE PEDIR</span>
            <h2>Informações para diagnóstico</h2>
            <p>
              Se nossa equipe solicitar, você pode baixar um arquivo com
              informações do funcionamento do MonitorIA. Ele não inclui senhas
              das câmeras, imagens, vídeos ou dados de pagamento.
            </p>
          </div>
          <a href="/api/support/diagnostics">
            Baixar informações para o suporte
          </a>
        </section>
      </section>
    </main>
  );
}
