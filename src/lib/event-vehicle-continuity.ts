import type { AnalyzedEvent } from "@/src/contracts/analyzed-event";

export type VehicleContinuityProcessingResult = {
  enabled: boolean;
  eventId: string;
  probableDistinctVehicleCount: number;
  linksCreated: number;
  isContinuation: boolean;
  continuationOfEventId: string | null;
  continuityConfidence: number;
};

type SupabaseLike = {
  from: (table: string) => any;
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type VehicleLike = {
  type?: unknown;
  color?: unknown;
  zoneIds?: unknown;
  zone_ids?: unknown;
  appearance?: unknown;
  confidence?: unknown;
  appearance_confidence?: unknown;
};

type VehicleContinuationCandidate = {
  eventId: string;
  confidence: number;
  method: "vehicle_instance" | "appearance_context";
  sharedVehicleInstanceCount: number;
};

const VEHICLE_EVENT_CONTINUITY_THRESHOLD = 0.72;
const VEHICLE_FALLBACK_WINDOW_MINUTES = 15;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => stringValue(item))
        .filter((item): item is string => Boolean(item))
    : [];
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map(stringValue).filter((value): value is string => Boolean(value)))];
}

function normalizedKnownValue(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase("pt-BR");
  return normalized && normalized !== "unknown" ? normalized : null;
}

function appearanceField(vehicle: VehicleLike, field: string) {
  return normalizedKnownValue(objectValue(vehicle.appearance)[field]);
}

function vehicleZones(vehicle: VehicleLike) {
  return stringArray(vehicle.zoneIds ?? vehicle.zone_ids);
}

function hasSharedZone(left: VehicleLike, right: VehicleLike) {
  const rightZones = new Set(vehicleZones(right));
  return vehicleZones(left).some((zoneId) => rightZones.has(zoneId));
}

function knownValuesConflict(left: string | null, right: string | null) {
  return Boolean(left && right && left !== right);
}

export function scoreVehicleContinuationCandidate(input: {
  current: VehicleLike;
  previous: VehicleLike;
  gapSeconds: number;
}) {
  const currentType = normalizedKnownValue(input.current.type);
  const previousType = normalizedKnownValue(input.previous.type);

  if (knownValuesConflict(currentType, previousType)) return 0;
  if (!hasSharedZone(input.current, input.previous)) return 0;

  const currentColor =
    appearanceField(input.current, "colorFamily") ??
    normalizedKnownValue(input.current.color);
  const previousColor =
    appearanceField(input.previous, "colorFamily") ??
    normalizedKnownValue(input.previous.color);
  const currentBody = appearanceField(input.current, "bodyStyle");
  const previousBody = appearanceField(input.previous, "bodyStyle");
  const currentSize = appearanceField(input.current, "sizeClass");
  const previousSize = appearanceField(input.previous, "sizeClass");
  const currentOrientation = appearanceField(input.current, "orientation");
  const previousOrientation = appearanceField(input.previous, "orientation");

  if (knownValuesConflict(currentColor, previousColor)) return 0;
  if (knownValuesConflict(currentBody, previousBody)) return 0;

  let score = currentType && previousType ? 0.25 : 0.1;
  score += 0.25;

  score += currentColor && previousColor ? 0.15 : 0.05;
  score += currentBody && previousBody ? 0.15 : 0.06;

  if (!knownValuesConflict(currentSize, previousSize)) {
    score += currentSize && previousSize ? 0.08 : 0.03;
  }

  if (
    currentOrientation &&
    previousOrientation &&
    currentOrientation === previousOrientation
  ) {
    score += 0.05;
  }

  if (input.gapSeconds <= 180) score += 0.12;
  else if (input.gapSeconds <= 600) score += 0.08;
  else if (input.gapSeconds <= 900) score += 0.04;

  return Math.max(0, Math.min(1, score));
}

async function candidateFromVehicleInstances(input: {
  supabase: SupabaseLike;
  organizationId: string;
  eventId: string;
  cameraId: string;
  startedAt: string;
}): Promise<VehicleContinuationCandidate | null> {
  const { data: currentRows, error: currentLinksError } =
    await input.supabase
      .from("event_vehicle_memory_links")
      .select(
        "event_id,vehicle_instance_id,link_kind,similarity_score,created_at",
      )
      .eq("organization_id", input.organizationId)
      .eq("event_id", input.eventId);

  if (currentLinksError) {
    console.error(
      "Falha ao carregar vínculos atuais de veículo:",
      currentLinksError.message,
    );
    return null;
  }

  const currentLinks = Array.isArray(currentRows) ? currentRows : [];
  const vehicleInstanceIds = uniqueStrings(
    currentLinks.map((row) => row.vehicle_instance_id),
  );
  if (!vehicleInstanceIds.length) return null;

  const { data: priorRows, error: priorLinksError } =
    await input.supabase
      .from("event_vehicle_memory_links")
      .select(
        "event_id,vehicle_instance_id,link_kind,similarity_score,created_at",
      )
      .eq("organization_id", input.organizationId)
      .in("vehicle_instance_id", vehicleInstanceIds)
      .neq("event_id", input.eventId)
      .order("created_at", { ascending: false })
      .limit(80);

  if (priorLinksError) {
    console.error(
      "Falha ao procurar continuidade anterior de veículo:",
      priorLinksError.message,
    );
    return null;
  }

  const priorLinks = Array.isArray(priorRows) ? priorRows : [];
  const priorEventIds = uniqueStrings(priorLinks.map((row) => row.event_id));
  if (!priorEventIds.length) return null;

  const { data: priorEventRows, error: priorEventsError } =
    await input.supabase
      .from("events")
      .select("id,started_at,ended_at")
      .eq("organization_id", input.organizationId)
      .eq("camera_id", input.cameraId)
      .in("id", priorEventIds)
      .lt("started_at", input.startedAt)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(20);

  if (priorEventsError) {
    console.error(
      "Falha ao carregar evento anterior do mesmo veículo:",
      priorEventsError.message,
    );
    return null;
  }

  const previousEvent = Array.isArray(priorEventRows)
    ? priorEventRows[0]
    : null;
  if (!previousEvent) return null;

  const previousEventId = String(previousEvent.id);
  const previousLinks = priorLinks.filter(
    (row) => String(row.event_id) === previousEventId,
  );
  const previousInstanceIds = new Set(
    previousLinks.map((row) => String(row.vehicle_instance_id)),
  );
  const sharedInstanceIds = vehicleInstanceIds.filter((id) =>
    previousInstanceIds.has(id),
  );
  if (!sharedInstanceIds.length) return null;

  const currentScore = Math.max(
    0,
    ...currentLinks
      .filter((row) => sharedInstanceIds.includes(String(row.vehicle_instance_id)))
      .map((row) => numberValue(row.similarity_score)),
  );
  const previousScore = Math.max(
    0,
    ...previousLinks
      .filter((row) => sharedInstanceIds.includes(String(row.vehicle_instance_id)))
      .map((row) => numberValue(row.similarity_score)),
  );
  const confidence = Math.max(
    0,
    Math.min(1, Math.min(currentScore || 1, previousScore || 1)),
  );

  return confidence >= 0.58
    ? {
        eventId: previousEventId,
        confidence,
        method: "vehicle_instance",
        sharedVehicleInstanceCount: sharedInstanceIds.length,
      }
    : null;
}

async function candidateFromRecentAppearance(input: {
  supabase: SupabaseLike;
  organizationId: string;
  eventId: string;
  cameraId: string;
  profileVersion: number;
  startedAt: string;
  currentVehicles: AnalyzedEvent["vehicles"];
}): Promise<VehicleContinuationCandidate | null> {
  if (!input.currentVehicles.length) return null;

  const startedAtMs = new Date(input.startedAt).getTime();
  const from = new Date(
    startedAtMs - VEHICLE_FALLBACK_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: priorEventsRows, error: priorEventsError } =
    await input.supabase
      .from("events")
      .select("id,started_at,ended_at,primary_event_type,profile_version")
      .eq("organization_id", input.organizationId)
      .eq("camera_id", input.cameraId)
      .eq("profile_version", input.profileVersion)
      .gte("started_at", from)
      .lt("started_at", input.startedAt)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(10);

  if (priorEventsError) {
    console.error(
      "Falha ao procurar eventos recentes para continuidade visual de veículo:",
      priorEventsError.message,
    );
    return null;
  }

  const priorEvents = Array.isArray(priorEventsRows) ? priorEventsRows : [];
  const priorEventIds = priorEvents.map((event) => String(event.id));
  if (!priorEventIds.length) return null;

  const { data: previousVehiclesRows, error: previousVehiclesError } =
    await input.supabase
      .from("event_vehicles")
      .select(
        "event_id,vehicle_type,color,zone_ids,appearance,appearance_confidence,confidence",
      )
      .eq("organization_id", input.organizationId)
      .in("event_id", priorEventIds);

  if (previousVehiclesError) {
    console.error(
      "Falha ao carregar veículos recentes para continuidade visual:",
      previousVehiclesError.message,
    );
    return null;
  }

  const previousVehicles = Array.isArray(previousVehiclesRows)
    ? previousVehiclesRows
    : [];

  let best: VehicleContinuationCandidate | null = null;

  for (const previousEvent of priorEvents) {
    const previousEventId = String(previousEvent.id);
    const gapSeconds = Math.max(
      0,
      (startedAtMs - new Date(String(previousEvent.ended_at)).getTime()) / 1000,
    );
    const vehiclesForEvent = previousVehicles.filter(
      (vehicle) => String(vehicle.event_id) === previousEventId,
    );

    for (const currentVehicle of input.currentVehicles) {
      for (const previousVehicle of vehiclesForEvent) {
        const score = scoreVehicleContinuationCandidate({
          current: currentVehicle,
          previous: {
            type: previousVehicle.vehicle_type,
            color: previousVehicle.color,
            zone_ids: previousVehicle.zone_ids,
            appearance: previousVehicle.appearance,
            confidence: previousVehicle.confidence,
            appearance_confidence: previousVehicle.appearance_confidence,
          },
          gapSeconds,
        });

        if (
          score >= VEHICLE_EVENT_CONTINUITY_THRESHOLD &&
          (!best || score > best.confidence)
        ) {
          best = {
            eventId: previousEventId,
            confidence: score,
            method: "appearance_context",
            sharedVehicleInstanceCount: 0,
          };
        }
      }
    }
  }

  return best;
}

async function persistEventLevelVehicleContinuity(input: {
  supabase: SupabaseLike;
  organizationId: string;
  eventId: string;
  vehicles: AnalyzedEvent["vehicles"];
}) {
  const { data: event, error: eventError } = await input.supabase
    .from("events")
    .select(
      "id,camera_id,profile_version,started_at,is_continuation,continuation_of_event_id,continuity_confidence,continuity_summary",
    )
    .eq("organization_id", input.organizationId)
    .eq("id", input.eventId)
    .maybeSingle();

  if (eventError || !event) {
    if (eventError) {
      console.error(
        "Falha ao carregar evento para continuidade de veículo:",
        eventError.message,
      );
    }
    return {
      isContinuation: false,
      continuationOfEventId: null,
      continuityConfidence: 0,
    };
  }

  const cameraId = String(event.camera_id);
  const startedAt = String(event.started_at);
  const profileVersion = numberValue(event.profile_version);

  const instanceCandidate = await candidateFromVehicleInstances({
    supabase: input.supabase,
    organizationId: input.organizationId,
    eventId: input.eventId,
    cameraId,
    startedAt,
  });

  const candidate =
    instanceCandidate ??
    (await candidateFromRecentAppearance({
      supabase: input.supabase,
      organizationId: input.organizationId,
      eventId: input.eventId,
      cameraId,
      profileVersion,
      startedAt,
      currentVehicles: input.vehicles,
    }));

  if (!candidate) {
    return {
      isContinuation: Boolean(event.is_continuation),
      continuationOfEventId: stringValue(event.continuation_of_event_id),
      continuityConfidence: numberValue(event.continuity_confidence),
    };
  }

  const existingSummary = objectValue(event.continuity_summary);
  const nextSummary = {
    ...existingSummary,
    vehicleContinuity: {
      method: candidate.method,
      previousEventId: candidate.eventId,
      sharedVehicleInstanceCount: candidate.sharedVehicleInstanceCount,
      confidence: candidate.confidence,
      plateUsed: false,
      profileVersion,
    },
  };

  const alreadyContinuation = Boolean(event.is_continuation);
  const existingConfidence = numberValue(event.continuity_confidence);
  const update: Record<string, unknown> = {
    continuity_summary: nextSummary,
    continuity_confidence: Math.max(
      existingConfidence,
      candidate.confidence,
    ),
    updated_at: new Date().toISOString(),
  };

  if (!alreadyContinuation) {
    update.is_continuation = true;
    update.continuation_of_event_id = candidate.eventId;
  }

  const { error: updateError } = await input.supabase
    .from("events")
    .update(update)
    .eq("organization_id", input.organizationId)
    .eq("id", input.eventId);

  if (updateError) {
    console.error(
      "Falha ao salvar continuidade de veículo no evento:",
      updateError.message,
    );
    return {
      isContinuation: alreadyContinuation,
      continuationOfEventId: stringValue(event.continuation_of_event_id),
      continuityConfidence: existingConfidence,
    };
  }

  return {
    isContinuation: true,
    continuationOfEventId:
      stringValue(event.continuation_of_event_id) ?? candidate.eventId,
    continuityConfidence: Math.max(
      existingConfidence,
      candidate.confidence,
    ),
  };
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

  const eventContinuity = await persistEventLevelVehicleContinuity({
    supabase: input.supabase,
    organizationId: input.organizationId,
    eventId: input.eventId,
    vehicles: input.vehicles,
  });

  return {
    enabled: Boolean(value.enabled),
    eventId: String(value.eventId ?? input.eventId),
    probableDistinctVehicleCount: numberValue(
      value.probableDistinctVehicleCount,
    ),
    linksCreated: numberValue(value.linksCreated),
    isContinuation: eventContinuity.isContinuation,
    continuationOfEventId: eventContinuity.continuationOfEventId,
    continuityConfidence: eventContinuity.continuityConfidence,
  };
}
