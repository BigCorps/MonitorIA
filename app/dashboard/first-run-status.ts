"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type FirstRunStage = 1 | 2 | 3 | 4 | 5;

export type FirstRunStatus = {
  /** 1 conectar, 2 procurar, 3 aguardar imagem, 4 explicar o ambiente, 5 pronto. */
  stage: FirstRunStage;
  cameras: number;
  camerasOnline: number;
  firstCameraId: string | null;
};

/**
 * Consulta enxuta, feita para ser chamada de poucos em poucos segundos.
 *
 * Existe porque o cliente precisava atualizar a página à mão para ver que o
 * pareamento deu certo e, depois, para ver a primeira imagem chegar. Quem
 * está configurando não sabe que precisa apertar F5 — ele conclui que travou.
 */
export async function getFirstRunStatusAction(): Promise<FirstRunStatus> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  const vazio: FirstRunStatus = {
    stage: 1,
    cameras: 0,
    camerasOnline: 0,
    firstCameraId: null,
  };

  if (!organization) return vazio;

  const supabase = createAdminClient();

  const [{ count: agentes }, { data: cameras }, { count: perfis }] =
    await Promise.all([
    supabase
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .neq("status", "disabled"),
    supabase
      .from("cameras")
      .select("id,status")
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("camera_profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("is_active", true),
  ]);

  const lista = (cameras ?? []) as unknown as Record<string, unknown>[];
  const online = lista.filter((row) => String(row.status ?? "") === "online");

  const stage: FirstRunStage =
    (agentes ?? 0) === 0
      ? 1
      : lista.length === 0
        ? 2
        : online.length === 0
          ? 3
          : (perfis ?? 0) === 0
            ? 4
            : 5;

  return {
    stage,
    cameras: lista.length,
    camerasOnline: online.length,
    firstCameraId: online[0]
      ? String(online[0].id)
      : lista[0]
        ? String(lista[0].id)
        : null,
  };
}
