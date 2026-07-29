"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";

const IdSchema = z.string().uuid();
const PreferenceSchema = z.enum([
  "nano",
  "mini",
  "equivalent",
  "both_bad",
]);

export async function rateVisionExperimentAction(
  formData: FormData,
) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    throw new Error("Operação não autorizada.");
  }

  const experimentId = String(
    formData.get("experiment_id") ?? "",
  );
  const preference = String(
    formData.get("preference") ?? "",
  );

  if (
    !IdSchema.safeParse(experimentId).success ||
    !PreferenceSchema.safeParse(preference).success
  ) {
    throw new Error("Avaliação inválida.");
  }

  const supabase = await createClient();

  const { error } = await supabase.rpc(
    "rate_vision_model_experiment",
    {
      p_experiment_id: experimentId,
      p_preference: preference,
    },
  );

  if (error) {
    console.error(
      "Falha ao avaliar comparação de modelos:",
      error.message,
    );
    throw new Error(
      "Não foi possível salvar a avaliação.",
    );
  }

  revalidatePath("/dashboard/vision-tests");
}
