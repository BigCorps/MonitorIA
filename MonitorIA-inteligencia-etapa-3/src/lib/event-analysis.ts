import {
  AnalyzedEventSchema,
  type AnalyzedEvent,
} from "@/src/contracts/analyzed-event";
import type { PersonAppearance } from "@/src/contracts/person-memory";
import type {
  CameraVisualEntity,
  VisualStateObservation,
} from "@/src/contracts/visual-state";
import { normalizeVisualStateObservations } from "@/src/vision/visual-state";

function allowedZoneIds(
  values: string[],
  allowed: ReadonlySet<string>,
): string[] {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

type LegacyPerson = Omit<
  AnalyzedEvent["people"][number],
  "appearance"
> & {
  appearance?: PersonAppearance;
};

type LegacyAnalyzedEvent = Omit<
  AnalyzedEvent,
  "schemaVersion" | "stateObservations" | "sessionSignals" | "people"
> & {
  schemaVersion: "1.1" | "1.2" | "1.3" | "1.4";
  stateObservations?: VisualStateObservation[];
  sessionSignals?: AnalyzedEvent["sessionSignals"];
  people: LegacyPerson[];
};

export function normalizeAnalyzedEventZones(
  event: AnalyzedEvent | LegacyAnalyzedEvent,
  allowed: ReadonlySet<string>,
  visualEntities: CameraVisualEntity[] = [],
): AnalyzedEvent {
  return AnalyzedEventSchema.parse({
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
      // ALPR permanece fora da v1. A tabela existe apenas como reserva futura.
      plateSuggestion: null,
    })),
    objects: event.objects.map((object) => ({
      ...object,
      zoneIds: allowedZoneIds(object.zoneIds, allowed),
    })),
    schemaVersion: "1.4",
    stateObservations: normalizeVisualStateObservations(
      event.stateObservations ?? [],
      visualEntities,
    ),
    sessionSignals: (event.sessionSignals ?? []).map((signal) => ({
      ...signal,
      zoneIds: allowedZoneIds(signal.zoneIds, allowed),
    })),
  });
}
