import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { McpConnectionGuide } from "./mcp-connection-guide";
import { revokeMcpConnection } from "./actions";
import styles from "./mcp-connections.module.css";

export const metadata = { title: "Integrações MCP" };
export const dynamic = "force-dynamic";

type ConnectionView = {
  clientId: string;
  clientName: string;
  organizations: string[];
  scopes: string[];
  active: boolean;
  createdAt: string;
};

function canonicalMcpUrl() {
  return (
    process.env.MCP_RESOURCE_URI?.trim() ||
    `${(process.env.MCP_PUBLIC_BASE_URL ?? "https://www.monitoria.cam").replace(/\/$/, "")}/mcp`
  );
}

export default async function McpConnectionsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const { data } = await supabase
    .from("mcp_oauth_grants")
    .select(
      "client_id,client_name,organization_id,approved_scopes,created_at,revoked_at,organization:organizations(name)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const grouped = new Map<string, ConnectionView>();

  for (const row of data ?? []) {
    const clientId = String((row as any).client_id);
    const current = grouped.get(clientId) ?? {
      clientId,
      clientName: String((row as any).client_name ?? "Aplicativo MCP"),
      organizations: [],
      scopes: Array.isArray((row as any).approved_scopes)
        ? (row as any).approved_scopes.map(String)
        : [],
      active: false,
      createdAt: String((row as any).created_at),
    };

    const relation = (row as any).organization;
    const related = Array.isArray(relation) ? relation[0] : relation;
    current.organizations.push(
      String(related?.name ?? (row as any).organization_id),
    );

    if (!(row as any).revoked_at) current.active = true;
    grouped.set(clientId, current);
  }

  const connections = [...grouped.values()];

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="administration"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">INTEGRAÇÕES DE IA</span>
            <h1>Conexões MCP</h1>
            <p>
              Conecte o MonitorIA ao ChatGPT, Claude e Cursor e controle os
              acessos já autorizados.
            </p>
          </div>

          <Link
            className="panel-primary-action"
            href="/integrations/monitoria-mcp"
          >
            Sobre o MCP
          </Link>
        </header>

        <McpConnectionGuide mcpUrl={canonicalMcpUrl()} />

        <section className={styles.connectionsSection}>
          <div className={styles.sectionTitle}>
            <div>
              <span>ACESSOS AUTORIZADOS</span>
              <h2>Conexões da sua conta</h2>
            </div>
            <small>
              A conexão aparece aqui depois da autorização OAuth ser concluída.
            </small>
          </div>

          <div className={styles.list}>
            {connections.length ? (
              connections.map((connection) => (
                <article className={styles.card} key={connection.clientId}>
                  <div className={styles.connectionIdentity}>
                    <span
                      className={
                        connection.active
                          ? styles.activeBadge
                          : styles.revokedBadge
                      }
                    >
                      {connection.active ? "ATIVO" : "REVOGADO"}
                    </span>
                    <h3>{connection.clientName}</h3>
                    <p>{connection.organizations.join(" · ")}</p>
                    <small>
                      Escopos:{" "}
                      {connection.scopes.join(", ") || "openid, email, profile"}
                    </small>
                    <small>
                      Autorizado em{" "}
                      {new Date(connection.createdAt).toLocaleDateString(
                        "pt-BR",
                      )}
                    </small>
                  </div>

                  {connection.active ? (
                    <form action={revokeMcpConnection}>
                      <input
                        type="hidden"
                        name="client_id"
                        value={connection.clientId}
                      />
                      <button type="submit">Revogar acesso</button>
                    </form>
                  ) : null}
                </article>
              ))
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  ↗
                </div>
                <h3>Nenhuma integração conectada</h3>
                <p>
                  Escolha uma plataforma acima, adicione a URL do MonitorIA e
                  conclua o login para que a conexão apareça aqui.
                </p>
              </div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
