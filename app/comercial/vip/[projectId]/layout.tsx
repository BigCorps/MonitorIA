import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./project-nav.module.css";

export default async function VipProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const base = `/comercial/vip/${encodeURIComponent(projectId)}`;

  return (
    <>
      <nav className={styles.tabs} aria-label="Projeto VIP">
        <Link href={base}>Resumo / proposta</Link>
        <Link href={`${base}/acompanhar`}>Acompanhamento ao vivo</Link>
      </nav>
      {children}
    </>
  );
}
