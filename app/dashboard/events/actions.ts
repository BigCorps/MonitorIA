"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import { createClient } from "@/src/lib/supabase/server";

const IdSchema = z.string().uuid();
const VerdictSchema = z.enum([
  "useful",
  "irrelevant",
  "incorrect",
]);

export async function reviewEventAction(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const eventId = String(formData.get("event_id") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const correctedEventType = String(
    formData.get("corrected_event_type") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "")
    .trim()
    .slice(0, 2000);

  if (
    !IdSchema.safeParse(eventId).success ||
    !VerdictSchema.safeParse(verdict).success
  ) {
    throw new Error("Avaliação inválida.");
  }

  if (verdict === "incorrect" && !correctedEventType) {
    throw new Error(
      "Informe o tipo correto quando a classificação estiver incorreta.",
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "review_monitoria_event",
    {
      p_event_id: eventId,
      p_verdict: verdict,
      p_corrected_event_type:
        correctedEventType || null,
      p_notes: notes,
    },
  );

  if (error) {
    console.error(
      "Falha ao revisar evento:",
      error.message,
    );
    throw new Error(
      "Não foi possível salvar a avaliação.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/search");
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(`/dashboard/events/${eventId}?saved=1`);
}

export async function deleteEventAction(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const eventId = String(formData.get("event_id") ?? "");

  if (!IdSchema.safeParse(eventId).success) {
    throw new Error("Evento inválido.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "soft_delete_monitoria_event",
    { p_event_id: eventId },
  );

  if (error) {
    console.error(
      "Falha ao excluir evento:",
      error.message,
    );
    throw new Error(
      "Não foi possível excluir o evento.",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/search");
  redirect("/dashboard/events?deleted=1");
}
