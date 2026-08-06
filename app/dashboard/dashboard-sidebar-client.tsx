"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import styles from "./dashboard-sidebar.module.css";

export type DashboardSection =
  | "overview"
  | "cameras"
  | "events"
  | "sessions"
  | "routines"
  | "processes"
  | "operational-profiles"
  | "camera-health"
  | "search"
  | "trial"
  | "plans"
  | "billing"
  | "storage"
  | "installer"
  | "profile"
  | "activity"
  | "intelligence"
  | "administration"
  | "admin";

type NavId =
  "overview" | "monitoring" | "cameras" | "search" | "settings" | "admin";

type Props = {
  organizationName: string;
  userEmail: string | null;
  active: DashboardSection;
  organizationRole: string;
  isInternalOperator: boolean;
};

type NavigationItem = {
  id: NavId;
  href: string;
  label: string;
  icon: ReactNode;
  adminStar?: boolean;
};

function Icon({ children }: { children?: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

function SettingsIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 21c0-4 2.8-7 7-7s7 3 7 7" />
      <path d="M19 4v5M16.5 6.5h5" />
    </Icon>
  );
}

const baseItems: NavigationItem[] = [
  {
    id: "overview",
    href: "/dashboard",
    label: "Visão geral",
    icon: (
      <Icon>
        <path d="M3.5 10.5 12 3l8.5 7.5" />
        <path d="M5.5 9.5V21h13V9.5" />
      </Icon>
    ),
  },
  {
    id: "monitoring",
    href: "/dashboard/events",
    label: "Monitoramento",
    icon: (
      <Icon>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="7" cy="6" r="1" />
        <circle cx="14" cy="12" r="1" />
      </Icon>
    ),
  },
  {
    id: "cameras",
    href: "/dashboard/cameras",
    label: "Câmeras",
    icon: (
      <Icon>
        <rect x="3" y="6" width="18" height="13" rx="3" />
        <circle cx="12" cy="12.5" r="3.5" />
      </Icon>
    ),
  },
  {
    id: "search",
    href: "/dashboard/search",
    label: "Pesquisa IA",
    icon: (
      <Icon>
        <rect x="4" y="6" width="16" height="13" rx="4" />
        <path d="M12 3v3M8 11h.01M16 11h.01M8 15h8" />
      </Icon>
    ),
  },
];

const adminItem: NavigationItem = {
  id: "admin",
  href: "/dashboard/admin",
  label: "Painel Admin",
  adminStar: true,
  icon: (
    <Icon>
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />
    </Icon>
  ),
};

function resolvedActive(pathname: string, fallback: DashboardSection): NavId {
  if (pathname === "/dashboard") return "overview";

  if (
    pathname.startsWith("/dashboard/admin") ||
    pathname.startsWith("/dashboard/operations/ai") ||
    pathname.startsWith("/dashboard/vision-tests")
  ) {
    return "admin";
  }

  if (
    pathname.startsWith("/dashboard/cameras") ||
    pathname.startsWith("/dashboard/installer")
  ) {
    return "cameras";
  }

  if (
    pathname.startsWith("/dashboard/activity") ||
    pathname.startsWith("/dashboard/events") ||
    pathname.startsWith("/dashboard/sessions") ||
    pathname.startsWith("/dashboard/intelligence") ||
    pathname.startsWith("/dashboard/routines") ||
    pathname.startsWith("/dashboard/processes") ||
    pathname.startsWith("/dashboard/operational-profiles") ||
    pathname.startsWith("/dashboard/camera-health")
  ) {
    return "monitoring";
  }

  if (pathname.startsWith("/dashboard/search")) {
    return "search";
  }

  if (
    pathname.startsWith("/dashboard/administration") ||
    pathname.startsWith("/dashboard/trial") ||
    pathname.startsWith("/dashboard/plans") ||
    pathname.startsWith("/dashboard/billing") ||
    pathname.startsWith("/dashboard/storage") ||
    pathname.startsWith("/dashboard/profile") ||
    pathname.startsWith("/dashboard/assistant-credits")
  ) {
    return "settings";
  }

  const map: Record<DashboardSection, NavId> = {
    overview: "overview",
    cameras: "cameras",
    installer: "cameras",
    events: "monitoring",
    sessions: "monitoring",
    routines: "monitoring",
    processes: "monitoring",
    "operational-profiles": "monitoring",
    "camera-health": "monitoring",
    activity: "monitoring",
    intelligence: "monitoring",
    search: "search",
    trial: "settings",
    plans: "settings",
    billing: "settings",
    storage: "settings",
    profile: "settings",
    administration: "settings",
    admin: "admin",
  };

  return map[fallback];
}

function Brand() {
  return (
    <Link
      href="/dashboard"
      className={`dashboard-brand ${styles.brand}`}
      aria-label="Abrir visão geral do MonitorIA"
    >
      <span
        className={`dashboard-logo-mark ${styles.logoMark}`}
        aria-hidden="true"
      >
        <img src="/favicon.svg" alt="" width={24} height={24} />
      </span>
      <span className={styles.brandText}>
        Monitor<span>IA</span>.cam
      </span>
    </Link>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <Icon>
      {open ? (
        <>
          <path d="m6 6 12 12" />
          <path d="M18 6 6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </Icon>
  );
}

function Navigation({
  items,
  current,
  onNavigate,
}: {
  items: NavigationItem[];
  current: NavId;
  onNavigate?: () => void;
}) {
  return (
    <nav className={styles.navigation} aria-label="Menu do dashboard">
      {items.map((item) => (
        <Link
          className={
            current === item.id ? `active ${styles.activeLink}` : undefined
          }
          href={item.href}
          key={item.id}
          onClick={onNavigate}
          aria-current={current === item.id ? "page" : undefined}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>
            {item.label}
            {item.adminStar ? (
              <span className={styles.adminStar} aria-label="acesso interno">
                ★
              </span>
            ) : null}
          </span>
          <span className={styles.navArrow} aria-hidden="true">
            ›
          </span>
        </Link>
      ))}
    </nav>
  );
}

function Account({
  organizationName,
  userEmail,
  settingsActive,
}: {
  organizationName: string;
  userEmail: string | null;
  settingsActive: boolean;
}) {
  const initial = organizationName.trim().charAt(0).toUpperCase() || "M";

  return (
    <div className={`sidebar-account ${styles.account}`}>
      <Link
        className={styles.accountIdentity}
        href="/dashboard/profile"
        aria-label="Abrir perfil e dados da empresa"
      >
        <span className={styles.accountAvatar} aria-hidden="true">
          {initial}
        </span>
        <div>
          <span>{organizationName}</span>
          <small>{userEmail ?? "Usuário autenticado"}</small>
        </div>
      </Link>
      <Link
        className={`${styles.accountSettings} ${
          settingsActive ? styles.accountSettingsActive : ""
        }`}
        href="/dashboard/profile"
        aria-current={settingsActive ? "page" : undefined}
      >
        <span className={styles.accountSettingsIcon} aria-hidden="true">
          <SettingsIcon />
        </span>
        <span>Configurações</span>
      </Link>
      <form action="/auth/signout" method="post">
        <button type="submit">Sair da conta</button>
      </form>
    </div>
  );
}

export function DashboardSidebarClient({
  organizationName,
  userEmail,
  active,
  isInternalOperator,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const current = resolvedActive(pathname, active);

  const items = useMemo(
    () => [...baseItems, ...(isInternalOperator ? [adminItem] : [])],
    [isInternalOperator],
  );

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", close);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <>
      <aside className={`dashboard-sidebar ${styles.sidebar}`}>
        <div className={styles.desktopBrand}>
          <Brand />
        </div>
        <div className={styles.desktopNavigation}>
          <Navigation items={items} current={current} />
        </div>
        <div className={styles.desktopAccount}>
          <Account
            organizationName={organizationName}
            userEmail={userEmail}
            settingsActive={current === "settings"}
          />
        </div>

        <div className={styles.mobileBar}>
          <Brand />
          <button
            type="button"
            className={styles.menuButton}
            aria-label={
              open ? "Fechar menu do dashboard" : "Abrir menu do dashboard"
            }
            aria-controls={drawerId}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </aside>

      <div
        className={`${styles.mobileOverlay} ${
          open ? styles.overlayVisible : ""
        }`}
        aria-hidden={!open}
        onClick={() => setOpen(false)}
      />

      <aside
        id={drawerId}
        className={`${styles.mobileDrawer} ${open ? styles.drawerOpen : ""}`}
        aria-hidden={!open}
        aria-label="Navegação mobile do MonitorIA"
      >
        <div className={styles.drawerHeader}>
          <div>
            <span>MENU PRINCIPAL</span>
            <strong>{organizationName}</strong>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
          >
            <MenuIcon open />
          </button>
        </div>

        <Navigation
          items={items}
          current={current}
          onNavigate={() => setOpen(false)}
        />

        <Account
          organizationName={organizationName}
          userEmail={userEmail}
          settingsActive={current === "settings"}
        />
      </aside>
    </>
  );
}
