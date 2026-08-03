import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { DashboardSidebar } from "../../dashboard-sidebar";
import { revokeMcpConnection } from "./actions";
import styles from "./mcp-connections.module.css";

export const metadata = { title: "Integrações de IA" };
export const dynamic = "force-dynamic";

export default async function McpConnectionsPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const { data } = await supabase
    .from("mcp_oauth_grants")
    .select("client_id,client_name,organization_id,approved_scopes,created_at,revoked_at,organization:organizations(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const grouped = new Map<string, any>();
  for (const row of data ?? []) {
    const clientId = String((row as any).client_id);
    const current = grouped.get(clientId) ?? {
      clientId,
      clientName: String((row as any).client_name ?? "Aplicativo MCP"),
      organizations: [],
      scopes: (row as any).approved_scopes ?? [],
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

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="profile"
      />
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">INTEGRAÇÕES DE IA</span>
            <h1>Conexões MCP</h1>
            <p>
              Revogue o acesso de ChatGPT, Claude e outros aplicativos de IA
              conectados ao MonitorIA.
            </p>
          </div>
          <Link
            className="panel-primary-action"
            href="/integrations/monitoria-mcp"
          >
            Sobre o MCP
          </Link>
        </header>

        <div className={styles.list}>
          {[...grouped.values()].length ? (
            [...grouped.values()].map((connection) => (
              <article className={styles.card} key={connection.clientId}>
                <div>
                  <span>{connection.active ? "ATIVO" : "REVOGADO"}</span>
                  <h2>{connection.clientName}</h2>
                  <p>{connection.organizations.join(" · ")}</p>
                  <small>
                    Escopos: {connection.scopes.join(", ") || "padrão"}
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
              <h2>Nenhuma integração conectada</h2>
              <p>
                As conexões aparecerão aqui depois que você autorizar um
                aplicativo de IA.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
