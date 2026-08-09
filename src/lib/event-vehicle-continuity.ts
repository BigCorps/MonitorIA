import type { AnalyzedEvent } from "@/src/contracts/analyzed-event";

export type VehicleContinuityProcessingResult = {
  enabled: boolean;
  eventId: string;
  probableDistinctVehicleCount: number;
  linksCreated: number;
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

export async function persistEventVehicleAppearanceAndContinuity(input: {
  supabase: SupabaseLike;
  organizationId: string;
  eventId: string;
  vehicles: AnalyzedEvent["vehicles"];
}): Promise<VehicleContinuityProcessingResult | null> {
  const { data: rows, error: vehiclesError } = await input.supabase
    .from("event_vehicles")
    .select("id,local_track_id,created_at")
    .eq("organization_id", input.organizationId)
    .eq("event_id", input.eventId)
    .order("created_at", { ascending: true });

  if (vehiclesError) {
    console.error(
      "Falha ao carregar veículos para memória temporária:",
      vehiclesError.message,
    );
    return null;
  }

  const eventVehicles = Array.isArray(rows) ? rows : [];
  const availableRows = [...eventVehicles];

  for (let index = 0; index < input.vehicles.length; index += 1) {
    const vehicle = input.vehicles[index];
    if (!vehicle) continue;

    const expectedTrackId = vehicle.localTrackId
      ? `${input.eventId}:${vehicle.localTrackId}`
      : null;
    const rowIndex = expectedTrackId
      ? availableRows.findIndex(
          (row) => String(row.local_track_id ?? "") === expectedTrackId,
        )
      : 0;
    const effectiveIndex = rowIndex >= 0 ? rowIndex : 0;
    const [row] = availableRows.splice(effectiveIndex, 1);
    if (!row) continue;

    const { error } = await input.supabase
      .from("event_vehicles")
      .update({
        appearance: vehicle.appearance,
        appearance_confidence: vehicle.appearance.confidence,
      })
      .eq("id", String(row.id))
      .eq("organization_id", input.organizationId);

    if (error) {
      console.error(
        `Falha ao salvar aparência temporária do veículo ${index}:`,
        error.message,
      );
    }
  }

  const { data, error } = await input.supabase.rpc(
    "process_event_vehicle_memory_v1",
    { p_event_id: input.eventId },
  );

  if (error) {
    console.error(
      "Falha ao processar memória temporária de veículos:",
      error.message,
    );
    return null;
  }

  const value = objectValue(data);

  const { error: reconcileError } = await input.supabase.rpc(
    "reconcile_event_vehicle_memory_v2",
    { p_event_id: input.eventId },
  );

  if (reconcileError) {
    console.error(
      "Falha ao reconciliar a memória temporária de veículos:",
      reconcileError.message,
    );
  }

  return {
    enabled: Boolean(value.enabled),
    eventId: String(value.eventId ?? input.eventId),
    probableDistinctVehicleCount: numberValue(
      value.probableDistinctVehicleCount,
    ),
    linksCreated: numberValue(value.linksCreated),
  };
}
