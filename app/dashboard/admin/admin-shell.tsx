import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

export type AdminSectionKey =
  | "overview"
  | "customers"
  | "finance"
  | "ai"
  | "operations"
  | "infrastructure"
  | "attention"
  | "launch"
  | "audit";

type AdminIdentity = {
  email: string | null;
};

const NAV: Array<{
  key: AdminSectionKey;
  label: string;
  href: string;
  icon: string;
}> = [
  { key: "overview", label: "Visão Geral", href: "/dashboard/admin", icon: "◫" },
  { key: "customers", label: "Clientes", href: "/dashboard/admin/customers", icon: "◎" },
  { key: "finance", label: "Financeiro", href: "/dashboard/admin/finance", icon: "R$" },
  { key: "ai", label: "IA & custos", href: "/dashboard/admin/ai", icon: "✦" },
  { key: "operations", label: "Operação", href: "/dashboard/admin/operations", icon: "◉" },
  { key: "infrastructure", label: "Infraestrutura", href: "/dashboard/admin/infrastructure", icon: "⌘" },
  { key: "attention", label: "Atenção", href: "/dashboard/admin/attention", icon: "!" },
  { key: "launch", label: "Release", href: "/dashboard/admin/launch", icon: "✓" },
  { key: "audit", label: "Auditoria", href: "/dashboard/admin/audit", icon: "◇" },
];

export function AdminHeader({
  admin,
  active,
}: {
  admin: AdminIdentity;
  active: AdminSectionKey;
}) {
  return (
    <header className={styles.adminHeader}>
      <div className={styles.headerMain}>
        <Link href="/dashboard/admin" className={styles.adminBrand}>
          <span className={styles.brandMark}>M</span>
          <span>
            <strong>Admin MonitorIA</strong>
            <small>BIGCORPS</small>
          </span>
        </Link>

        <div className={styles.headerRight}>
          <div className={styles.adminIdentity}>
            <strong>Administrador</strong>
            <small>{admin.email ?? "Conta autenticada"}</small>
          </div>
          <Link
            href="/dashboard"
            className={styles.exitButton}
            title="Voltar ao dashboard"
            aria-label="Voltar ao dashboard"
          >
            ↗
          </Link>
        </div>
      </div>

      <nav className={styles.adminNav}>
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`${styles.navItem} ${
              active === item.key ? styles.navItemActive : ""
            }`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function AdminShell({
  admin,
  active,
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  admin: AdminIdentity;
  active: AdminSectionKey;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className={styles.page}>
      <AdminHeader admin={admin} active={active} />
      <div className={styles.container}>
        <header className={styles.pageIntro}>
          <div>
            <span className={styles.pageEyebrow}>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {actions ? <div className={styles.pageActions}>{actions}</div> : null}
        </header>
        {children}
      </div>
    </main>
  );
}

export function AdminMetric({
  title,
  value,
  subtitle,
  emphasized = false,
}: {
  title: string;
  value: ReactNode;
  subtitle?: string;
  emphasized?: boolean;
}) {
  return (
    <article
      className={`${styles.metricCard} ${
        emphasized ? styles.metricCardEmphasized : ""
      }`}
    >
      <span>{title}</span>
      <strong>{value}</strong>
      {subtitle ? <small>{subtitle}</small> : null}
    </article>
  );
}

export function RelativeTime({ value }: { value: string | null }) {
  if (!value) return <>—</>;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return <>—</>;

  const diff = time - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (abs < 60_000) return <>{formatter.format(Math.round(diff / 1000), "second")}</>;
  if (abs < 3_600_000)
    return <>{formatter.format(Math.round(diff / 60_000), "minute")}</>;
  if (abs < 86_400_000)
    return <>{formatter.format(Math.round(diff / 3_600_000), "hour")}</>;
  return <>{formatter.format(Math.round(diff / 86_400_000), "day")}</>;
}
