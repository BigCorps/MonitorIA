export type DashboardNavigationGroupId =
  "monitoring" | "cameras" | "settings" | "intelligence";

export type DashboardNavigationItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
  exactPaths?: string[];
  activePrefixes?: string[];
  excludePrefixes?: string[];
};

export type DashboardNavigationGroup = {
  label: string;
  items: DashboardNavigationItem[];
};

/**
 * Contrato de navegação do dashboard do cliente.
 *
 * As próximas fases de inteligência não devem criar novas entradas na sidebar.
 * Um novo módulo deve:
 * 1. morar dentro de Monitoramento;
 * 2. ser registrado em `intelligence.items`;
 * 3. renderizar as abas de Monitoramento e Inteligência;
 * 4. usar `/dashboard/intelligence/<slug>` quando não houver rota anterior.
 */
export const dashboardNavigationGroups: Record<
  DashboardNavigationGroupId,
  DashboardNavigationGroup
> = {
  monitoring: {
    label: "Navegação de monitoramento",
    items: [
      {
        id: "events",
        label: "Acontecimentos",
        href: "/dashboard/events",
        exactPaths: ["/dashboard/events", "/dashboard/activity"],
        activePrefixes: ["/dashboard/events/"],
      },
      {
        id: "sessions",
        label: "Períodos",
        href: "/dashboard/sessions",
        exactPaths: ["/dashboard/sessions"],
        activePrefixes: ["/dashboard/sessions/"],
      },
      {
        id: "routines",
        label: "Rotinas",
        href: "/dashboard/routines",
        exactPaths: ["/dashboard/routines"],
        activePrefixes: ["/dashboard/routines/"],
      },
      {
        id: "processes",
        label: "Processos",
        href: "/dashboard/processes",
        exactPaths: ["/dashboard/processes"],
        activePrefixes: ["/dashboard/processes/"],
      },
      {
        id: "profiles",
        label: "Padrões da operação",
        href: "/dashboard/operational-profiles",
        exactPaths: ["/dashboard/operational-profiles"],
        activePrefixes: ["/dashboard/operational-profiles/"],
      },
      {
        id: "health",
        label: "Funcionamento",
        href: "/dashboard/camera-health",
        exactPaths: ["/dashboard/camera-health"],
        activePrefixes: ["/dashboard/camera-health/"],
      },
      {
        id: "operations",
        label: "Alertas",
        href: "/dashboard/operations",
        exactPaths: ["/dashboard/operations"],
      },
      {
        id: "cross-camera",
        label: "Entre câmeras",
        href: "/dashboard/intelligence/cross-camera",
        exactPaths: ["/dashboard/intelligence/cross-camera"],
      },
    ],
  },
  cameras: {
    label: "Navegação de câmeras",
    items: [
      {
        id: "camera-list",
        label: "Câmeras",
        href: "/dashboard/cameras",
        exactPaths: ["/dashboard/cameras"],
        activePrefixes: ["/dashboard/cameras/new", "/dashboard/cameras/"],
        excludePrefixes: ["/dashboard/cameras/connections"],
      },
      {
        id: "agent",
        label: "Instalação",
        href: "/dashboard/installer",
        exactPaths: ["/dashboard/installer"],
        activePrefixes: ["/dashboard/installer/"],
        excludePrefixes: ["/dashboard/installer/pair"],
      },
      {
        id: "pair-computer",
        label: "Parear computador",
        href: "/dashboard/installer/pair",
        exactPaths: ["/dashboard/installer/pair"],
      },
      {
        id: "connections",
        label: "Como conectar",
        href: "/dashboard/cameras/connections",
        exactPaths: ["/dashboard/cameras/connections"],
        activePrefixes: ["/dashboard/cameras/connections/"],
      },
    ],
  },
  settings: {
    label: "Navegação de configurações",
    items: [
      {
        id: "company",
        label: "Empresa e equipe",
        href: "/dashboard/profile",
        exactPaths: ["/dashboard/profile"],
        activePrefixes: ["/dashboard/profile/"],
        excludePrefixes: ["/dashboard/profile/mcp-connections"],
      },
      {
        id: "plan",
        label: "Plano e cobrança",
        href: "/dashboard/plans",
        exactPaths: [
          "/dashboard/plans",
          "/dashboard/billing",
          "/dashboard/trial",
          "/dashboard/assistant-credits",
        ],
        activePrefixes: [
          "/dashboard/plans/",
          "/dashboard/billing/",
          "/dashboard/trial/",
          "/dashboard/assistant-credits/",
        ],
      },
      {
        id: "storage",
        label: "Dados armazenados",
        href: "/dashboard/storage",
        exactPaths: ["/dashboard/storage"],
        activePrefixes: ["/dashboard/storage/"],
      },
      {
        id: "integrations",
        label: "Integrações",
        href: "/dashboard/profile/mcp-connections",
        exactPaths: ["/dashboard/profile/mcp-connections"],
        activePrefixes: ["/dashboard/profile/mcp-connections/"],
      },
      {
        id: "support",
        label: "Suporte",
        href: "/dashboard/support",
        exactPaths: ["/dashboard/support"],
      },
    ],
  },
  intelligence: {
    label: "Módulos de inteligência",
    items: [
      {
        id: "routines",
        label: "Rotinas",
        href: "/dashboard/routines",
        exactPaths: ["/dashboard/routines"],
        activePrefixes: ["/dashboard/routines/"],
      },
      {
        id: "processes",
        label: "Processos",
        href: "/dashboard/processes",
        exactPaths: ["/dashboard/processes"],
        activePrefixes: ["/dashboard/processes/"],
      },
      {
        id: "profiles",
        label: "Padrões da operação",
        href: "/dashboard/operational-profiles",
        exactPaths: ["/dashboard/operational-profiles"],
        activePrefixes: ["/dashboard/operational-profiles/"],
      },
      {
        id: "cross-camera",
        label: "Entre câmeras",
        href: "/dashboard/intelligence/cross-camera",
        exactPaths: ["/dashboard/intelligence/cross-camera"],
      },
    ],
  },
};
