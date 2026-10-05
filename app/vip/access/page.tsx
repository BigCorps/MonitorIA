import Link from "next/link";
import { redirect } from "next/navigation";
import { appConfig } from "@/src/lib/app-config";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { getVipProjectForOrganization } from "@/src/vip/server";
import styles from "./vip-access.module.css";

export const metadata = {
  title: "Acesso MonitorIA VIP",
  robots: { index: false, follow: false, noarchive: true },
};

export const dynamic = "force-dynamic";

export default async function VipAccessPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    redirect(`${appConfig.url}/onboarding`);
  }

  const project = await getVipProjectForOrganization(organization.id);

  if (project) {
    if (project.status === "active") {
      redirect("/vip/dashboard");
    }

    if (
      ["trial_completed", "proposal", "payment_pending"].includes(
        project.status,
      )
    ) {
      redirect("/vip/closing");
    }

    if (project.status !== "cancelled") {
      redirect("/vip/onboarding");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <img src="/vip-favicon.svg" alt="" width={34} height={34} />
          <span>
            Monitor<em>IA</em>.cam
          </span>
          <b>VIP</b>
        </div>

        <span className={styles.eyebrow}>ACESSO VIP</span>
        <h1>Esta conta ainda não possui um Projeto VIP ativo.</h1>
        <p>
          Você já está conectado ao MonitorIA
          {user.email ? ` como ${user.email}` : ""}. O acesso Standard e o VIP
          usam a mesma conta; não é necessário criar outro cadastro.
        </p>

        <div className={styles.notice}>
          <strong>Se você já contratou ou recebeu um convite VIP</strong>
          <span>
            Abra o link individual enviado pelo especialista. Ele vincula o
            Projeto VIP à empresa correta sem duplicar sua conta.
          </span>
        </div>

        <div className={styles.actions}>
          <a className={styles.primary} href={`${appConfig.url}/dashboard`}>
            Abrir meu painel MonitorIA
          </a>
          <Link className={styles.secondary} href="/">
            Voltar ao MonitorIA VIP
          </Link>
        </div>

        <small>
          Se esperava encontrar um Projeto VIP aqui, fale com o especialista
          responsável para conferir o vínculo da sua empresa.
        </small>
      </section>
    </main>
  );
}
