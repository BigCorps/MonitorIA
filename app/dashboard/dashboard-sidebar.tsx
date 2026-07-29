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
  | "search"
  | "agents";

type Props = {
  organizationName: string;
  userEmail: string | null;
  active: DashboardSection;
};

type NavigationItem = {
  id: DashboardSection;
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

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 10h8M8 14h5M9 2v3M15 2v3" />
      <circle cx="17" cy="15" r="1.5" />
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
    id: "search",
    href: "/dashboard/search",
    label: "Pesquisa",
    icon: <SearchIcon />,
  },
  {
    id: "agents",
    href: "/dashboard#agentes",
    label: "Agents locais",
    icon: <AgentIcon />,
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
        <img
          src="/favicon.svg"
          alt=""
          width={24}
          height={24}
        />
      </span>

      <span className={styles.brandText}>
        Monitor<span>IA</span>
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
          aria-current={
            active === item.id ? "page" : undefined
          }
        >
          <span className={styles.navIcon}>
            {item.icon}
          </span>
          <span className={styles.navLabel}>
            {item.label}
          </span>
          <span
            className={styles.navArrow}
            aria-hidden="true"
          >
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
      <div className={styles.accountIdentity}>
        <span
          className={styles.accountAvatar}
          aria-hidden="true"
        >
          {initial}
        </span>
        <div>
          <span>{organizationName}</span>
          <small>
            {userEmail ?? "Usuário autenticado"}
          </small>
        </div>
      </div>

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
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <>
      <aside
        className={`dashboard-sidebar ${styles.sidebar}`}
      >
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
