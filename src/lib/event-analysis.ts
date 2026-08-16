import {
  AnalyzedEventSchema,
  type AnalyzedEvent,
} from "@/src/contracts/analyzed-event";
import type { PersonAppearance } from "@/src/contracts/person-memory";
import { EmptySceneComplexity } from "@/src/contracts/scene-intelligence";
import type {
  EntityRelation,
  SceneComplexity,
  VehicleAppearance,
} from "@/src/contracts/scene-intelligence";
import type {
  CameraVisualEntity,
  VisualStateObservation,
} from "@/src/contracts/visual-state";
import { normalizeVisualStateObservations } from "@/src/vision/visual-state";

export const EVENT_REVIEW_CONFIDENCE_THRESHOLD = 0.35;

function allowedZoneIds(
  values: string[],
  allowed: ReadonlySet<string>,
): string[] {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

function uniqueReviewReasons(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function applyConfidenceReviewGuard(
  event: AnalyzedEvent,
): AnalyzedEvent {
  if (event.primaryEventType === "no_relevant_change") {
    return event;
  }

  if (event.confidence >= EVENT_REVIEW_CONFIDENCE_THRESHOLD) {
    return event;
  }

  const reviewReasons = uniqueReviewReasons([
    ...event.reviewReasons,
    "low_event_confidence",
    ...(event.confidence === 0
      ? ["zero_event_confidence"]
      : []),
  ]);

  return AnalyzedEventSchema.parse({
    ...event,
    requiresReview: true,
    reviewReasons,
  });
}

type LegacyPerson = Omit<
  AnalyzedEvent["people"][number],
  "appearance"
> & {
  appearance?: PersonAppearance;
};

type LegacyVehicle = Omit<
  AnalyzedEvent["vehicles"][number],
  "appearance"
> & {
  appearance?: VehicleAppearance;
};

type LegacyAnalyzedEvent = Omit<
  AnalyzedEvent,
  | "schemaVersion"
  | "stateObservations"
  | "sessionSignals"
  | "entityRelations"
  | "sceneComplexity"
  | "people"
  | "vehicles"
> & {
  schemaVersion: "1.1" | "1.2" | "1.3" | "1.4" | "1.5";
  stateObservations?: VisualStateObservation[];
  sessionSignals?: AnalyzedEvent["sessionSignals"];
  entityRelations?: EntityRelation[];
  sceneComplexity?: SceneComplexity;
  people: LegacyPerson[];
  vehicles: LegacyVehicle[];
};

export function normalizeAnalyzedEventZones(
  event: AnalyzedEvent | LegacyAnalyzedEvent,
  allowed: ReadonlySet<string>,
  visualEntities: CameraVisualEntity[] = [],
): AnalyzedEvent {
  const normalized = AnalyzedEventSchema.parse({
    ...event,
    zoneIds: allowedZoneIds(event.zoneIds, allowed),
    observations: event.observations.map((observation) => ({
      ...observation,
      zoneIds: allowedZoneIds(observation.zoneIds, allowed),
    })),
    people: event.people.map((person) => ({
      ...person,
      zoneIds: allowedZoneIds(person.zoneIds, allowed),
    })),
    vehicles: event.vehicles.map((vehicle) => ({
      ...vehicle,
      zoneIds: allowedZoneIds(vehicle.zoneIds, allowed),
      plateSuggestion: null,
    })),
    objects: event.objects.map((object) => ({
      ...object,
      zoneIds: allowedZoneIds(object.zoneIds, allowed),
    })),
    // Preserva a versão de entrada até o preprocessamento do contrato.
    // Para 1.1–1.4, AnalyzedEventSchema preenche appearance/sceneComplexity
    // ausentes e então migra o resultado validado para 1.5.
    schemaVersion: event.schemaVersion,
    stateObservations: normalizeVisualStateObservations(
      event.stateObservations ?? [],
      visualEntities,
    ),
    sessionSignals: (event.sessionSignals ?? []).map((signal) => ({
      ...signal,
      zoneIds: allowedZoneIds(signal.zoneIds, allowed),
    })),
    entityRelations: (event.entityRelations ?? []).map((relation) => ({
      ...relation,
      zoneIds: allowedZoneIds(relation.zoneIds, allowed),
    })),
    sceneComplexity: event.sceneComplexity ?? EmptySceneComplexity,
  });

  return applyConfidenceReviewGuard(normalized);
}
