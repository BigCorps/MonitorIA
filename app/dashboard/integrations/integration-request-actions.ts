"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  integrationAccessStatuses,
  integrationBusinessTypes,
  integrationSystemKeys,
  integrationSystemLabel,
  integrationUseCaseKeys,
  integrationUseCaseLabel,
} from "@/src/lib/integration-catalog";
import { notifyIntegrationRequest } from "@/src/lib/integration-request-notification";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type IntegrationRequestActionState = {
  status: "idle" | "success" | "error";
  message: string;
  requestId?: string;
};

export const initialIntegrationRequestState: IntegrationRequestActionState = {
  status: "idle",
  message: "",
};

const allowedSystems = new Set<string>(integrationSystemKeys);
const allowedUseCases = new Set<string>(integrationUseCaseKeys);
const allowedBusinessTypes = new Set<string>(
  integrationBusinessTypes.map((item) => item.key),
);
const allowedAccessStatuses = new Set<string>(
  integrationAccessStatuses.map((item) => item.key),
);

function clean(value: FormDataEntryValue | null, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function positiveInt(value: FormDataEntryValue | null, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(999, Math.max(1, parsed));
}

export async function submitIntegrationRequest(
  _previousState: IntegrationRequestActionState,
  formData: FormData,
): Promise<IntegrationRequestActionState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return {
      status: "error",
      message: "Não foi possível identificar a empresa desta solicitação.",
    };
  }

  const systems = [
    ...new Set(
      formData
        .getAll("systems")
        .map(String)
        .filter((value) => allowedSystems.has(value)),
    ),
  ];

  if (!systems.length) {
    return {
      status: "error",
      message: "Selecione pelo menos um sistema para avaliarmos.",
    };
  }

  const useCases = [
    ...new Set(
      formData
        .getAll("use_cases")
        .map(String)
        .filter((value) => allowedUseCases.has(value)),
    ),
  ];

  const businessTypeValue = clean(formData.get("business_type"), 80);
  const businessType = allowedBusinessTypes.has(businessTypeValue)
    ? businessTypeValue
    : "other";

  const integrationAccessValue = clean(formData.get("integration_access"), 80);
  const integrationAccess = allowedAccessStatuses.has(integrationAccessValue)
    ? integrationAccessValue
    : "unknown";

  const otherSystem = clean(formData.get("other_system"), 180) || null;
  const hasOther = systems.some((system) => system.startsWith("other_"));

  if (hasOther && !otherSystem) {
    return {
      status: "error",
      message: "Informe o nome do outro sistema selecionado.",
    };
  }

  const contactPhone = clean(formData.get("contact_phone"), 80) || null;
  const versionNotes = clean(formData.get("version_notes"), 500) || null;
  const supplierContact = clean(formData.get("supplier_contact"), 300) || null;
  const details = clean(formData.get("details"), 2000) || null;
  const locationsCount = positiveInt(formData.get("locations_count"));
  const camerasCount = positiveInt(formData.get("cameras_count"));

  const admin = createAdminClient();
  const { data: requestRow, error: insertError } = await admin
    .from("integration_requests")
    .insert({
      organization_id: organization.id,
      requested_by_user_id: user.id,
      requester_email: user.email,
      contact_phone: contactPhone,
      systems,
      use_cases: useCases,
      business_type: businessType,
      locations_count: locationsCount,
      cameras_count: camerasCount,
      other_system: otherSystem,
      version_notes: versionNotes,
      integration_access: integrationAccess,
      supplier_contact: supplierContact,
      details,
      status: "new",
    })
    .select("id")
    .single();

  if (insertError || !requestRow) {
    console.error(
      "[integrations] Falha ao registrar solicitação:",
      insertError?.message,
    );
    return {
      status: "error",
      message: "Não foi possível registrar a solicitação. Tente novamente.",
    };
  }

  const businessTypeLabel =
    integrationBusinessTypes.find((item) => item.key === businessType)?.label ??
    businessType;
  const integrationAccessLabel =
    integrationAccessStatuses.find((item) => item.key === integrationAccess)
      ?.label ?? integrationAccess;

  const notification = await notifyIntegrationRequest({
    requestId: String(requestRow.id),
    organizationName: organization.name,
    organizationId: organization.id,
    requesterEmail: user.email,
    contactPhone,
    systems: systems.map(integrationSystemLabel),
    useCases: useCases.map(integrationUseCaseLabel),
    businessType: businessTypeLabel,
    locationsCount,
    camerasCount,
    versionNotes,
    integrationAccess: integrationAccessLabel,
    supplierContact,
    otherSystem,
    details,
  });

  await admin
    .from("integration_requests")
    .update(
      notification.ok
        ? { email_sent_at: new Date().toISOString(), notification_error: null }
        : { notification_error: notification.error },
    )
    .eq("id", requestRow.id);

  if (!notification.ok) {
    console.error(
      `[integrations] Solicitação ${requestRow.id} registrada, mas o e-mail falhou: ${notification.error}`,
    );
  }

  return {
    status: "success",
    message:
      "Solicitação recebida. Vamos avaliar o acesso técnico, a complexidade e retornar com os próximos passos.",
    requestId: String(requestRow.id),
  };
}
