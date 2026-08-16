"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

function salesTrialRedirect(
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/dashboard/trial/sales?${kind}=${encodeURIComponent(message)}`,
  );
}

function salesTrialError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("sales_trial_camera_limit")) {
    return "Você selecionou mais câmeras do que este convite permite.";
  }
  if (normalized.includes("sales_trial_camera_required")) {
    return "Selecione pelo menos uma câmera.";
  }
  if (normalized.includes("camera_trial_already_used")) {
    return "Uma das câmeras selecionadas já participou de outro teste gratuito.";
  }
  if (normalized.includes("agent_trial_already_used")) {
    return "Um dos computadores selecionados já foi utilizado em outro teste gratuito.";
  }
  if (normalized.includes("device_trial_already_used")) {
    return "Um dos computadores selecionados já utilizou um teste gratuito do MonitorIA.";
  }
  if (normalized.includes("user_trial_already_used")) {
    return "Este usuário já utilizou um teste gratuito em outra empresa.";
  }
  if (normalized.includes("organization_already_paid")) {
    return "Esta empresa já possui pagamento confirmado e não precisa de um novo teste.";
  }
  if (normalized.includes("organization_already_subscribed")) {
    return "Esta empresa já possui uma assinatura ativa.";
  }
  if (normalized.includes("email_confirmation_required")) {
    return "Confirme seu e-mail antes de iniciar a demonstração.";
  }
  if (normalized.includes("trial_camera_not_ready")) {
    return "Ainda existe câmera selecionada com pendência. Atualize a prontidão antes de iniciar.";
  }
  if (normalized.includes("trial_selection_locked")) {
    return "As câmeras não podem mais ser alteradas depois que o teste começou.";
  }
  if (normalized.includes("sales_trial_not_prepared")) {
    return "Este teste comercial não está disponível para esta empresa.";
  }

  return "Não foi possível atualizar o teste comercial. Tente novamente.";
}

async function salesContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);
  if (!organization) redirect("/onboarding");

  if (organization.role !== "owner" && organization.role !== "admin") {
    salesTrialRedirect(
      "error",
      "Somente proprietários e administradores podem configurar o teste.",
    );
  }

  return { user, organization };
}

function refreshPaths() {
  revalidatePath("/dashboard/trial/sales");
  revalidatePath("/dashboard/trial");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/cameras");
  revalidatePath("/dashboard/plans");
}

export async function prepareSalesTrialAction(formData: FormData) {
  const { organization } = await salesContext();
  const cameraIds = [
    ...new Set(
      formData
        .getAll("camera_id")
        .map((value) => String(value))
        .filter(Boolean),
    ),
  ];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "prepare_sales_monitoria_trial",
    {
      p_organization_id: organization.id,
      p_camera_ids: cameraIds,
    },
  );

  if (error) {
    console.error("Falha ao preparar trial comercial:", error.message);
    salesTrialRedirect("error", salesTrialError(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  refreshPaths();
  salesTrialRedirect(
    "message",
    result.ready === true
      ? "Todas as câmeras selecionadas estão prontas. Você já pode iniciar os 60 minutos."
      : "Seleção salva. Conclua as pendências indicadas antes de iniciar o relógio.",
  );
}

export async function refreshSalesTrialAction() {
  const { organization } = await salesContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "refresh_sales_monitoria_trial",
    { p_organization_id: organization.id },
  );

  if (error) {
    console.error("Falha ao atualizar trial comercial:", error.message);
    salesTrialRedirect("error", salesTrialError(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  refreshPaths();
  salesTrialRedirect(
    "message",
    result.ready === true
      ? "Tudo pronto. O relógio ainda não começou."
      : "Prontidão atualizada. Ainda existem pendências em pelo menos uma câmera.",
  );
}

export async function startSalesTrialAction() {
  const { organization } = await salesContext();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "start_sales_monitoria_trial",
    { p_organization_id: organization.id },
  );

  if (error) {
    console.error("Falha ao iniciar trial comercial:", error.message);
    salesTrialRedirect("error", salesTrialError(error.message));
  }

  const result =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  if (result.success !== true) {
    salesTrialRedirect("error", "O teste comercial não foi iniciado.");
  }

  refreshPaths();
  salesTrialRedirect(
    "message",
    result.duplicate === true
      ? "A demonstração já estava em andamento."
      : "Demonstração iniciada. O relógio de 60 minutos começou agora.",
  );
}
