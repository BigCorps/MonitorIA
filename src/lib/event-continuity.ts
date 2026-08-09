import type { AnalyzedEvent } from "@/src/contracts/analyzed-event";
import { classifyOperationalPerson } from "@/src/lib/operational-person-role";

export type ContinuityProcessingResult = {
  enabled: boolean;
  eventId: string;
  interactionGroupId: string | null;
  isContinuation: boolean;
  continuationOfEventId: string | null;
  interactionEventCount: number;
  probablePeopleCount: number;
  probableCustomerCount: number;
  probableStaffCount: number;
};

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function persistEventPersonAppearanceAndContinuity(input: {
  supabase: SupabaseLike;
  organizationId: string;
  eventId: string;
  people: AnalyzedEvent["people"];
  sessionSignals: AnalyzedEvent["sessionSignals"];
  zones: Array<{ id: string; personRoleHint: string }>;
}): Promise<ContinuityProcessingResult | null> {
  const { data: rows, error: peopleError } = await input.supabase
    .from("event_people")
    .select("id,local_track_id,created_at")
    .eq("organization_id", input.organizationId)
    .eq("event_id", input.eventId)
    .order("created_at", { ascending: true });

  if (peopleError) {
    console.error(
      "Falha ao carregar pessoas para memória curta:",
      peopleError.message,
    );
    return null;
  }

  const eventPeople = Array.isArray(rows) ? rows : [];
  const availableRows = [...eventPeople];

  for (let index = 0; index < input.people.length; index += 1) {
    const person = input.people[index];
    if (!person) continue;

    const expectedTrackId = person.localTrackId
      ? `${input.eventId}:${person.localTrackId}`
      : null;
    const rowIndex = expectedTrackId
      ? availableRows.findIndex(
          (row) => String(row.local_track_id ?? "") === expectedTrackId,
        )
      : 0;
    const effectiveIndex = rowIndex >= 0 ? rowIndex : 0;
    const [row] = availableRows.splice(effectiveIndex, 1);
    if (!row) continue;

    const classification = classifyOperationalPerson({
      person,
      sessionSignals: input.sessionSignals,
      zones: input.zones,
    });

    const { error } = await input.supabase
      .from("event_people")
      .update({
        appearance: person.appearance,
        appearance_confidence: person.appearance.confidence,
        model_role: classification.modelRole,
        operational_role: classification.operationalRole,
        engaged_at_counter: classification.engagedAtCounter,
        operational_role_reason: classification.reason,
        role: classification.operationalRole,
      })
      .eq("id", String(row.id))
      .eq("organization_id", input.organizationId);

    if (error) {
      console.error(
        `Falha ao salvar aparência temporária da pessoa ${index}:`,
        error.message,
      );
    }
  }

  const { data, error } = await input.supabase.rpc(
    "process_event_continuity_v1",
    { p_event_id: input.eventId },
  );

  if (error) {
    console.error(
      "Falha ao processar continuidade do evento:",
      error.message,
    );
    return null;
  }

  const value = objectValue(data);

  const { error: reconcileError } = await input.supabase.rpc(
    "reconcile_event_people_memory_v2",
    { p_event_id: input.eventId },
  );

  if (reconcileError) {
    console.error(
      "Falha ao reconciliar a memória operacional de pessoas:",
      reconcileError.message,
    );
  }

  return {
    enabled: Boolean(value.enabled),
    eventId: String(value.eventId ?? input.eventId),
    interactionGroupId:
      typeof value.interactionGroupId === "string"
        ? value.interactionGroupId
        : null,
    isContinuation: Boolean(value.isContinuation),
    continuationOfEventId:
      typeof value.continuationOfEventId === "string"
        ? value.continuationOfEventId
        : null,
    interactionEventCount: numberValue(
      value.interactionEventCount,
    ),
    probablePeopleCount: numberValue(
      value.probablePeopleCount,
    ),
    probableCustomerCount: numberValue(
      value.probableCustomerCount,
    ),
    probableStaffCount: numberValue(
      value.probableStaffCount,
    ),
  };
}
