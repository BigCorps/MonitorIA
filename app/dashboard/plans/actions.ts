"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

const CameraPlanSelectionSchema = z
  .array(
    z
      .object({
        cameraId: z.string().uuid(),
        planCode: z.enum([
          "basic",
          "standard",
          "intensive",
        ]),
      })
      .strict(),
  )
  .min(1)
  .max(500)
  .superRefine((items, context) => {
    const seen = new Set<string>();

    items.forEach((item, index) => {
      if (seen.has(item.cameraId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "cameraId"],
          message: "Câmera repetida.",
        });
      }
      seen.add(item.cameraId);
    });
  });

function plansRedirect(
  kind: "message" | "error",
  message: string,
): never {
  redirect(
    `/dashboard/plans?${kind}=${encodeURIComponent(message)}`,
  );
}

function rpcErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("not_authorized")) {
    return "Somente proprietários e administradores podem preparar a cobrança.";
  }

  if (
    normalized.includes("invalid_camera_or_plan_selection")
  ) {
    return "Uma câmera ou plano selecionado não está disponível para esta empresa.";
  }

  if (normalized.includes("duplicate_camera_selection")) {
    return "Uma câmera foi selecionada mais de uma vez.";
  }

  if (normalized.includes("at_least_one_camera_required")) {
    return "Selecione pelo menos uma câmera.";
  }

  return "Não foi possível preparar a fatura. Tente novamente.";
}

async function cancelOmittedPendingSubscriptions(input: {
  organizationId: string;
  selectedCameraIds: string[];
}) {
  const admin = createAdminClient();
  const { data: pending, error } = await admin
    .from("camera_subscriptions")
    .select("camera_id")
    .eq("organization_id", input.organizationId)
    .eq("status", "pending_payment");

  if (error) {
    console.error(
      "Falha ao procurar assinaturas pendentes antigas:",
      error.message,
    );
    return;
  }

  const selected = new Set(input.selectedCameraIds);
  const omitted = (pending ?? [])
    .map((row) => String(row.camera_id))
    .filter((cameraId) => !selected.has(cameraId));

  if (!omitted.length) return;

  const now = new Date().toISOString();

  const [changesResult, subscriptionsResult] =
    await Promise.all([
      admin
        .from("camera_subscription_changes")
        .update({
          status: "cancelled",
          updated_at: now,
        })
        .eq("organization_id", input.organizationId)
        .in("camera_id", omitted)
        .eq("status", "pending_payment"),
      admin
        .from("camera_subscriptions")
        .update({
          status: "cancelled",
          cancelled_at: now,
          updated_at: now,
        })
        .eq("organization_id", input.organizationId)
        .in("camera_id", omitted)
        .eq("status", "pending_payment"),
    ]);

  if (changesResult.error || subscriptionsResult.error) {
    console.error(
      "Falha ao limpar câmeras retiradas da cobrança:",
      changesResult.error?.message ??
        subscriptionsResult.error?.message,
    );
  }
}

export async function createDraftInvoiceAction(
  formData: FormData,
) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) redirect("/onboarding");

  if (
    organization.role !== "owner" &&
    organization.role !== "admin"
  ) {
    plansRedirect(
      "error",
      "Somente proprietários e administradores podem alterar os planos.",
    );
  }

  const raw = String(
    formData.get("camera_plans") ?? "",
  );

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    plansRedirect(
      "error",
      "A seleção de câmeras não pôde ser lida.",
    );
  }

  const parsed =
    CameraPlanSelectionSchema.safeParse(parsedJson);

  if (!parsed.success) {
    plansRedirect(
      "error",
      "Escolha pelo menos uma câmera e revise os planos selecionados.",
    );
  }

  const serviceStart = new Date();
  const serviceEnd = new Date(serviceStart);
  serviceEnd.setUTCDate(serviceEnd.getUTCDate() + 30);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_organization_draft_invoice",
    {
      p_organization_id: organization.id,
      p_camera_plans: parsed.data,
      p_service_start: serviceStart.toISOString(),
      p_service_end: serviceEnd.toISOString(),
    },
  );

  if (error) {
    console.error(
      "Falha ao criar fatura em rascunho:",
      error.message,
    );
    plansRedirect("error", rpcErrorMessage(error.message));
  }

  const result =
    data &&
    typeof data === "object" &&
    !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const invoiceNumber = String(
    result.invoiceNumber ?? "nova fatura",
  );
  const invoiceId = String(result.invoiceId ?? "");

  if (!z.string().uuid().safeParse(invoiceId).success) {
    plansRedirect(
      "error",
      "A fatura foi preparada, mas não pôde ser aberta.",
    );
  }

  await cancelOmittedPendingSubscriptions({
    organizationId: organization.id,
    selectedCameraIds: parsed.data.map(
      (item) => item.cameraId,
    ),
  });

  revalidatePath("/dashboard/plans");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/cameras");

  redirect(
    `/dashboard/billing?invoice=${encodeURIComponent(
      invoiceId,
    )}&message=${encodeURIComponent(
      `${invoiceNumber} preparada. Gere o Pix para ativar as câmeras selecionadas.`,
    )}`,
  );
}
