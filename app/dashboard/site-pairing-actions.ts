"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  generatePairingCode,
  hashPairingCode,
} from "@/src/lib/agent-security";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createRepairPairingCodeAction } from "./installer/pair/actions";

export type SitePairingState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  expiresAt?: string;
  siteName?: string;
};

export type SitePairingOption = {
  id: string;
  name: string;
};

export async function getSitePairingOptionsAction(): Promise<{
  status: "success" | "error";
  sites: SitePairingOption[];
  message?: string;
}> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return {
      status: "error",
      sites: [],
      message: "Não encontramos sua empresa. Entre novamente e tente de novo.",
    };
  }

  const sites = await getOrganizationSites(organization.id);
  return {
    status: "success",
    sites: sites.map((site) => ({ id: site.id, name: site.name })),
  };
}

/**
 * Gera o código que conecta um computador a um Local.
 *
 * No fluxo VIP o Local é escolhido explicitamente. O comportamento antigo
 * (primeiro Local) permanece somente para as telas padrão enquanto a nova UX
 * ainda está sendo validada no VIP.
 */
export async function createSitePairingCodeAction(
  _previousState: SitePairingState,
  formData: FormData,
): Promise<SitePairingState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return {
      status: "error",
      message: "Não encontramos sua conta. Entre de novo e tente mais uma vez.",
    };
  }

  const sites = await getOrganizationSites(organization.id);
  const requestedSiteId = String(formData.get("site_id") ?? "").trim();

  if (requestedSiteId === "__new__") {
    const created = await createRepairPairingCodeAction(
      { status: "idle" },
      formData,
    );
    return {
      status: created.status,
      message: created.message,
      code: created.code,
      expiresAt: created.expiresAt,
      siteName: created.siteName,
    };
  }

  const site = requestedSiteId
    ? sites.find((item) => item.id === requestedSiteId) ?? null
    : sites[0] ?? null;

  if (requestedSiteId && !site) {
    return {
      status: "error",
      message: "Selecione um Local válido desta empresa.",
    };
  }

  if (!site) {
    return {
      status: "error",
      message: "Cadastre o Local onde este computador será instalado antes de continuar.",
    };
  }

  const code = generatePairingCode();
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("create_site_pairing_code", {
    p_site_id: site.id,
    p_code_hash: hashPairingCode(code),
    p_created_by: user.id,
  });

  const result = Array.isArray(data) ? data[0] : data;

  if (error || !result) {
    console.error(
      "Falha ao gerar código de pareamento do local:",
      error?.message ?? "sem retorno",
    );
    return {
      status: "error",
      message:
        "Não conseguimos gerar o código agora. Tente de novo em alguns instantes.",
    };
  }

  return {
    status: "success",
    code,
    expiresAt: String(result.expires_at),
    siteName: site.name,
    message: `Código criado para ${site.name}.`,
  };
}
