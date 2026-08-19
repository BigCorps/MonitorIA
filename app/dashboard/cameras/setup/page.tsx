import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { DashboardSidebar } from "../../dashboard-sidebar";
import {
  CameraNamingForm,
  type NamingCamera,
} from "./camera-naming-form";
import styles from "./setup.module.css";

export const metadata = { title: "Identificar câmeras" };
export const dynamic = "force-dynamic";

export default async function CameraSetupPage() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const supabase = createAdminClient();
  const { data: cameras } = await supabase
    .from("cameras")
    .select("id,name,status,stream_label,created_at")
    .eq("organization_id", organization.id)
    .is("setup_named_at", null)
    .order("created_at", { ascending: true });

  if (!cameras?.length) redirect("/dashboard/commercial-choice");

  const namingCameras: NamingCamera[] = cameras.map((camera) => ({
    id: String(camera.id),
    name: String(camera.name ?? ""),
    status: String(camera.status ?? "pending"),
    streamLabel: camera.stream_label ? String(camera.stream_label) : null,
  }));

  return (
    <main className="dashboard-shell">
      <DashboardSidebar
        organizationName={organization.name}
        userEmail={user.email}
        active="cameras"
      />

      <section className={`dashboard-content ${styles.content}`}>
        <header className="dashboard-header">
          <div>
            <span className="dashboard-eyebrow">IDENTIFICAR CÂMERAS</span>
            <h1>Dê um nome para cada câmera encontrada</h1>
            <p>
              Use a primeira imagem captada para reconhecer cada câmera antes
              de salvar o nome.
            </p>
          </div>
        </header>

        <CameraNamingForm cameras={namingCameras} />
      </section>
    </main>
  );
}
