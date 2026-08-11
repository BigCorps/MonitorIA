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

export type SitePairingState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  expiresAt?: string;
};

/**
 * Gera o código que conecta o computador da loja ao painel.
 *
 * Antes o código nascia preso a uma câmera, e por isso o cliente precisava
 * cadastrar uma câmera à mão antes de instalar o programa — inventando nome
 * e endereço de um aparelho que ele ainda nem sabia se estava na rede. Agora
 * o vínculo é com o local, e as câmeras entram depois, pela busca.
 */
export async function createSitePairingCodeAction(
  _previousState: SitePairingState,
  _formData: FormData,
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
  const site = sites[0];

  if (!site) {
    return {
      status: "error",
      message: "Cadastre o local do seu negócio antes de conectar o computador.",
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
  };
}
