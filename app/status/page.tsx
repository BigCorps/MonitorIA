import Link from "next/link";
import { getPlatformStatus } from "@/src/lib/platform-status-data";
import { createPageMetadata } from "@/src/lib/seo";
import styles from "./status.module.css";

export const metadata = createPageMetadata({
  title: "Status dos serviços",
  description: "Estado operacional público dos componentes do MonitorIA.cam.",
  path: "/status",
});
export const dynamic = "force-dynamic";

const labels = { operational: "Operacional", degraded: "Instabilidade", checking: "Verificando" };

export default async function StatusPage() {
  const status = await getPlatformStatus();
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <Link className={styles.back} href="/">← MonitorIA.cam</Link>
        <header className={styles.header}><span>STATUS PÚBLICO</span><h1>Estado dos serviços</h1><p>Uma visão segura da plataforma, sem expor câmeras, empresas, volumes ou incidentes individuais.</p></header>
        <section className={`${styles.overall} ${styles[status.overall]}`}><strong>{labels[status.overall]}</strong><span>{status.overall === "operational" ? "Todos os componentes verificados estão funcionando normalmente." : "Um ou mais componentes precisam de acompanhamento."}</span></section>
        <div className={styles.components}>{status.components.map((component) => <article className={styles.component} key={component.name}><div><h2>{component.name}</h2><p>{component.detail}</p></div><span className={`${styles.badge} ${styles[component.state]}`}>{labels[component.state]}</span></article>)}</div>
        <p className={styles.updated}>Atualizado em {new Date(status.generatedAt).toLocaleString("pt-BR")}.</p>
      </div>
    </main>
  );
}

