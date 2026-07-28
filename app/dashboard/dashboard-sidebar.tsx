import Link from "next/link";

export type DashboardSection = "overview" | "cameras" | "events" | "search" | "agents";

type Props = {
  organizationName: string;
  userEmail: string | null;
  active: DashboardSection;
};

const items: Array<{ id: DashboardSection; href: string; icon: string; label: string }> = [
  { id: "overview", href: "/dashboard", icon: "⌂", label: "Visão geral" },
  { id: "cameras", href: "/dashboard/cameras", icon: "◉", label: "Câmeras" },
  { id: "events", href: "/dashboard#eventos", icon: "≋", label: "Eventos" },
  { id: "search", href: "/dashboard#pesquisa", icon: "⌕", label: "Pesquisa" },
  { id: "agents", href: "/dashboard#agentes", icon: "◆", label: "Agentes" },
];

export function DashboardSidebar({ organizationName, userEmail, active }: Props) {
  return (
    <aside className="dashboard-sidebar">
      <Link href="/" className="dashboard-brand">
        <span className="dashboard-logo-mark" aria-hidden="true">
          <img src="/favicon.svg" alt="" width={22} height={22} />
        </span>
        <span>Monitor<span>IA</span></span>
      </Link>

      <nav>
        {items.map((item) => (
          <Link className={active === item.id ? "active" : undefined} href={item.href} key={item.id}>
            <span>{item.icon}</span> {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-account">
        <span>{organizationName}</span>
        <small>{userEmail ?? "Usuário autenticado"}</small>
        <form action="/auth/signout" method="post"><button type="submit">Sair</button></form>
      </div>
    </aside>
  );
}
