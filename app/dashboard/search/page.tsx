import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getAssistantWorkspace } from "@/src/lib/assistant-data";
import { getAssistantBalance } from "@/src/lib/assistant-commercial-data";
import {
  getCurrentOrganization,
  getOrganizationCameras,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { DashboardSidebar } from "../dashboard-sidebar";
import { AssistantBalanceCard } from "./assistant-balance-card";
import { AssistantChat } from "./assistant-chat";

export const metadata = { title: "Pesquisa" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

function scalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const rawParams = await searchParams;
  const requestedThreadId = scalar(rawParams.thread) || null;

  const [sites, cameras, workspace, balance] = await Promise.all([
    getOrganizationSites(organization.id),
    getOrganizationCameras(organization.id),
    getAssistantWorkspace(organization.id, requestedThreadId),
    getAssistantBalance(organization.id),
  ]);

  if (!sites.length) redirect("/onboarding");

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="search"
      />

      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">
              PESQUISA · {organization.name.toUpperCase()}
            </span>
            <h1>Converse com os acontecimentos</h1>
            <p>
              Pergunte sobre clientes, atendimentos, entregas,
              objetos, veículos e períodos. Os eventos aparecem
              somente quando sustentam a resposta.
            </p>
          </div>

          <Link
            href="/dashboard/events"
            className="panel-secondary-action"
          >
            Abrir eventos
          </Link>
        </header>

        <AssistantBalanceCard initialBalance={balance} />

        <AssistantChat
          initialWorkspace={workspace}
          sites={sites}
          cameras={cameras.map((camera) => ({
            id: camera.id,
            name: camera.name,
            siteId: camera.siteId,
          }))}
          timeZone={sites[0]?.timezone ?? "America/Sao_Paulo"}
        />
      </section>
    </main>
  );
}
