import {
  AnalyzedEventSchema,
  type AnalyzedEvent,
} from "@/src/contracts/analyzed-event";

function allowedZoneIds(
  values: string[],
  allowed: ReadonlySet<string>,
): string[] {
  return [...new Set(values.filter((value) => allowed.has(value)))];
}

export function normalizeAnalyzedEventZones(
  event: AnalyzedEvent,
  allowed: ReadonlySet<string>,
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
  });
}
