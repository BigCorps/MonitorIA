"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import styles from "./dashboard-sidebar.module.css";

export type DashboardSection =
  | "overview"
  | "cameras"
  | "events"
  | "sessions"
  | "routines"
  | "processes"
  | "search"
  | "trial"
  | "plans"
  | "billing"
  | "storage"
  | "installer"
  | "profile";

type Props = {
  organizationName: string;
  userEmail: string | null;
  active: DashboardSection;
};

type NavigationItem = {
  id: Exclude<DashboardSection, "profile">;
  href: string;
  label: string;
  icon: ReactNode;
};

function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 10.5 12 3l8.5 7.5" />
      <path d="M5.5 9.5V21h13V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <circle cx="12" cy="12.5" r="3.5" />
      <path d="M8 6 9.2 3.8h5.6L16 6" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="7" cy="6" r="1" />
      <circle cx="14" cy="12" r="1" />
      <circle cx="10" cy="18" r="1" />
    </svg>
  );
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v4H5z" />
      <path d="M5 11h14v4H5z" />
      <path d="M5 17h14v2H5z" />
      <path d="M8 7h8M8 13h8" />
    </svg>
  );
}

function RoutinesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function ProcessesIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="7" height="7" rx="1.5" />
      <rect x="14" y="13" width="7" height="7" rx="1.5" />
      <path d="M10 7.5h4a3 3 0 0 1 3 3V13" />
      <path d="M14 5l3 2.5-3 2.5" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="13" rx="4" />
      <path d="M12 3v3M8 11h.01M16 11h.01M8 15h8" />
    </svg>
  );
}

function TrialIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 3h6" />
      <path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />
      <path d="M7.5 15h9" />
    </svg>
  );
}

function PlansIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function StorageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

function InstallerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3v11" />
      <path d="m8 10 4 4 4-4" />
      <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
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
    </svg>
  );
}

const items: NavigationItem[] = [
  {
    id: "overview",
    href: "/dashboard",
    label: "Visão geral",
    icon: <OverviewIcon />,
  },
  {
    id: "cameras",
    href: "/dashboard/cameras",
    label: "Câmeras",
    icon: <CameraIcon />,
  },
  {
    id: "events",
    href: "/dashboard/events",
    label: "Eventos",
    icon: <EventsIcon />,
  },
  {
    id: "sessions",
    href: "/dashboard/sessions",
    label: "Sessões",
    icon: <SessionsIcon />,
  },
  {
    id: "routines",
    href: "/dashboard/routines",
    label: "Rotinas",
    icon: <RoutinesIcon />,
  },
  {
    id: "processes",
    href: "/dashboard/processes",
    label: "Processos",
    icon: <ProcessesIcon />,
  },
  {
    id: "search",
    href: "/dashboard/search",
    label: "Pesquisa",
    icon: <BotIcon />,
  },
  {
    id: "trial",
    href: "/dashboard/trial",
    label: "Teste grátis",
    icon: <TrialIcon />,
  },
  {
    id: "plans",
    href: "/dashboard/plans",
    label: "Planos",
    icon: <PlansIcon />,
  },
  {
    id: "billing",
    href: "/dashboard/billing",
    label: "Cobranças",
    icon: <BillingIcon />,
  },

  {
    id: "storage",
    href: "/dashboard/storage",
    label: "Armazenamento",
    icon: <StorageIcon />,
  },
  {
    id: "installer",
    href: "/dashboard/installer",
    label: "Instalador",
    icon: <InstallerIcon />,
  },
];

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

function Navigation({
  active,
  onNavigate,
}: {
  active: DashboardSection;
  onNavigate?: () => void;
}) {
  return (
    <nav className={styles.navigation} aria-label="Menu do dashboard">
      {items.map((item) => (
        <Link
          className={
            active === item.id
              ? `active ${styles.activeLink}`
              : undefined
          }
          href={item.href}
          key={item.id}
          onClick={onNavigate}
          aria-current={active === item.id ? "page" : undefined}
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>{item.label}</span>
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
}: {
  organizationName: string;
  userEmail: string | null;
}) {
  const initial =
    organizationName.trim().charAt(0).toUpperCase() || "M";

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
      <form action="/auth/signout" method="post">
        <button type="submit">Sair da conta</button>
      </form>
    </div>
  );
}

export function DashboardSidebar({
  organizationName,
  userEmail,
  active,
}: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <aside className={`dashboard-sidebar ${styles.sidebar}`}>
        <div className={styles.desktopBrand}>
          <Brand />
        </div>
        <div className={styles.desktopNavigation}>
          <Navigation active={active} />
        </div>
        <div className={styles.desktopAccount}>
          <Account
            organizationName={organizationName}
            userEmail={userEmail}
          />
        </div>
        <div className={styles.mobileBar}>
          <Brand />
          <button
            type="button"
            className={styles.menuButton}
            aria-label={
              open
                ? "Fechar menu do dashboard"
                : "Abrir menu do dashboard"
            }
            aria-controls={drawerId}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
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
        className={`${styles.mobileDrawer} ${
          open ? styles.drawerOpen : ""
        }`}
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
          active={active}
          onNavigate={() => setOpen(false)}
        />
        <Account
          organizationName={organizationName}
          userEmail={userEmail}
        />
      </aside>
    </>
  );
}
