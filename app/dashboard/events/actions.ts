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

const DetailQueryKeys = new Set([
  "from",
  "to",
  "site",
  "camera",
  "type",
  "review",
  "page",
]);

function safeDetailQuery(formData: FormData) {
  const raw = String(formData.get("detail_query") ?? "").slice(0, 2000);
  const source = new URLSearchParams(raw);
  const safe = new URLSearchParams();

  for (const [key, value] of source) {
    if (!DetailQueryKeys.has(key) || value.length > 160) continue;
    safe.set(key, value);
  }

  return safe;
}

function eventDetailUrl(
  eventId: string,
  query: URLSearchParams,
  state: string,
) {
  query.set(state, "1");
  return `/dashboard/events/${eventId}?${query.toString()}`;
}

export async function reviewEventAction(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const eventId = String(formData.get("event_id") ?? "");
  const reviewId = String(formData.get("review_id") ?? "");
  const verdict = String(formData.get("verdict") ?? "");
  const correctedEventType = String(
    formData.get("corrected_event_type") ?? "",
  ).trim();
  const notes = String(formData.get("notes") ?? "")
    .trim()
    .slice(0, 2000);

  if (
    !IdSchema.safeParse(eventId).success ||
    !VerdictSchema.safeParse(verdict).success ||
    (reviewId && !IdSchema.safeParse(reviewId).success)
  ) {
    throw new Error("Avaliação inválida.");
  }

  if (verdict === "incorrect" && !correctedEventType) {
    throw new Error(
      "Informe o tipo correto quando a classificação estiver incorreta.",
    );
  }

  const supabase = await createClient();
  const { error } = reviewId
    ? await supabase.rpc("update_monitoria_event_review", {
        p_review_id: reviewId,
        p_verdict: verdict,
        p_corrected_event_type: correctedEventType || null,
        p_notes: notes,
      })
    : await supabase.rpc("review_monitoria_event", {
        p_event_id: eventId,
        p_verdict: verdict,
        p_corrected_event_type: correctedEventType || null,
        p_notes: notes,
      });

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
  redirect(
    eventDetailUrl(
      eventId,
      safeDetailQuery(formData),
      reviewId ? "updated" : "saved",
    ),
  );
}

export async function deleteEventReviewAction(
  formData: FormData,
) {
  await requireAuthenticatedUser();

  const eventId = String(formData.get("event_id") ?? "");
  const reviewId = String(formData.get("review_id") ?? "");

  if (
    !IdSchema.safeParse(eventId).success ||
    !IdSchema.safeParse(reviewId).success
  ) {
    throw new Error("Revisão inválida.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(
    "delete_monitoria_event_review",
    { p_review_id: reviewId },
  );

  if (error) {
    console.error("Falha ao excluir revisão:", error.message);
    throw new Error("Não foi possível excluir a revisão.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/events");
  revalidatePath("/dashboard/search");
  revalidatePath(`/dashboard/events/${eventId}`);
  redirect(
    eventDetailUrl(
      eventId,
      safeDetailQuery(formData),
      "review_deleted",
    ),
  );
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
