"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { getVipProjectForOrganization } from "@/src/vip/server";
import { refreshVipOnboarding } from "@/src/vip/onboarding-server";

function vipRedirect(kind: "message" | "error", message: string): never {
  redirect(`/vip/onboarding?${kind}=${encodeURIComponent(message)}`);
}

function friendlyError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("sales_trial_camera_limit")) return "Selecione no máximo seis câmeras para o piloto VIP.";
  if (normalized.includes("sales_trial_camera_required")) return "Selecione pelo menos uma câmera para continuar.";
  if (normalized.includes("camera_trial_already_used")) return "Uma das câmeras já participou de outro teste gratuito.";
  if (normalized.includes("agent_trial_already_used")) return "Um dos computadores selecionados já participou de outro teste gratuito.";
  if (normalized.includes("trial_selection_locked")) return "A seleção de câmeras foi bloqueada porque o teste já começou.";
  if (normalized.includes("trial_camera_not_ready")) return "Ainda existe uma pendência nas câmeras selecionadas. Resolva o item indicado e verifique novamente.";
  return "Não foi possível atualizar a implantação VIP. Tente novamente.";
}

async function context() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  const project = await getVipProjectForOrganization(organization.id);
  if (!project) redirect("/dashboard");

  if (!["owner", "admin"].includes(organization.role)) {
    vipRedirect("error", "Somente proprietários e administradores podem alterar o piloto VIP.");
  }
  return { organization, project };
}

function refreshPaths() {
  revalidatePath("/vip/onboarding");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/trial/sales");
  revalidatePath("/dashboard/cameras");
}

export async function prepareVipTrialAction(formData: FormData) {
  const { organization, project } = await context();
  const cameraIds = [...new Set(
    formData.getAll("camera_id").map((value) => String(value)).filter(Boolean),
  )];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prepare_sales_monitoria_trial", {
    p_organization_id: organization.id,
    p_camera_ids: cameraIds,
  });

  if (error) {
    console.error("Falha ao preparar piloto VIP:", error.message);
    vipRedirect("error", friendlyError(error.message));
  }

  await refreshVipOnboarding(project.id, true);
  refreshPaths();

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};

  vipRedirect(
    "message",
    result.ready === true
      ? "Todas as câmeras selecionadas estão prontas. O relógio ainda não começou."
      : "Seleção salva. Resolva as pendências indicadas abaixo antes de iniciar o piloto.",
  );
}

export async function refreshVipTrialAction() {
  const { organization, project } = await context();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("refresh_sales_monitoria_trial", {
    p_organization_id: organization.id,
  });

  if (error) {
    console.error("Falha ao atualizar readiness VIP:", error.message);
    vipRedirect("error", friendlyError(error.message));
  }

  await refreshVipOnboarding(project.id, true);
  refreshPaths();

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};

  vipRedirect(
    "message",
    result.ready === true
      ? "Tudo pronto. Os 60 minutos continuam parados até sua confirmação."
      : "Prontidão atualizada. Veja abaixo exatamente o que falta em cada câmera.",
  );
}
