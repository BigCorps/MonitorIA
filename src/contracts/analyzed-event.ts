import { z } from "zod";
import {
  EmptyPersonAppearance,
  PersonAppearanceSchema,
} from "./person-memory";
import { SessionSignalSchema } from "./interaction-session";
import {
  EmptySceneComplexity,
  EmptyVehicleAppearance,
  EntityRelationSchema,
  SceneComplexitySchema,
  VehicleAppearanceSchema,
} from "./scene-intelligence";
import { VisualStateObservationSchema } from "./visual-state";

const EventTypeSchema = z.enum([
  "person_entered",
  "person_exited",
  "person_present",
  "vehicle_entered",
  "vehicle_exited",
  "vehicle_stopped",
  "vehicle_present",
  "object_appeared",
  "object_removed",
  "object_moved",
  "zone_intrusion",
  "unusual_activity",
  "scene_change",
  "no_relevant_change",
  "other",
]);

const PersonRoleSchema = z.enum([
  "staff",
  "customer",
  "delivery_person",
  "visitor",
  "unknown",
]);

const VisibilitySchema = z.enum([
  "clear",
  "partial",
  "blurred",
  "too_small",
  "not_visible",
]);

const VehicleTypeSchema = z.enum([
  "car",
  "motorcycle",
  "truck",
  "van",
  "bus",
  "bicycle",
  "unknown",
]);

const ObjectStateSchema = z.enum([
  "appeared",
  "removed",
  "moved",
  "present",
  "unknown",
]);

export const AnalyzedEventTransportSchema = z
  .object({
    schemaVersion: z.literal("1.5"),
    headline: z.string(),
    primaryEventType: EventTypeSchema,
    summary: z.string(),
    observations: z.array(
      z
        .object({
          type: EventTypeSchema,
          offsetSeconds: z.number(),
          description: z.string(),
          zoneIds: z.array(z.string()),
          confidence: z.number(),
        })
        .strict(),
    ),
    people: z.array(
      z
        .object({
          localTrackId: z.string().nullable(),
          role: PersonRoleSchema,
          roleConfidence: z.number(),
          upperClothingColor: z.string().nullable(),
          lowerClothingColor: z.string().nullable(),
          accessories: z.array(z.string()),
          carrying: z.array(z.string()),
          zoneIds: z.array(z.string()),
          appearance: PersonAppearanceSchema,
          confidence: z.number(),
        })
        .strict(),
    ),
    vehicles: z.array(
      z
        .object({
          localTrackId: z.string().nullable(),
          type: VehicleTypeSchema,
          color: z.string().nullable(),
          plateSuggestion: z
            .object({
              text: z.string().nullable(),
              confidence: z.number(),
              visibility: VisibilitySchema,
              status: z.literal("suggestion"),
            })
            .strict()
            .nullable(),
          zoneIds: z.array(z.string()),
          appearance: VehicleAppearanceSchema,
          confidence: z.number(),
        })
        .strict(),
    ),
    objects: z.array(
      z
        .object({
          localTrackId: z.string().nullable(),
          label: z.string(),
          color: z.string().nullable(),
          state: ObjectStateSchema,
          zoneIds: z.array(z.string()),
          confidence: z.number(),
        })
        .strict(),
    ),
    stateObservations: z
      .array(VisualStateObservationSchema)
      .max(20),
    sessionSignals: z.array(SessionSignalSchema).max(30),
    entityRelations: z.array(EntityRelationSchema).max(80),
    sceneComplexity: SceneComplexitySchema,
    zoneIds: z.array(z.string()),
    tags: z.array(z.string()),
    confidence: z.number(),
    requiresReview: z.boolean(),
    reviewReasons: z.array(z.string()),
  })
  .strict();

const ValidatedAnalyzedEventSchema =
  AnalyzedEventTransportSchema.superRefine(
    (event, context) => {
      const confidenceValues = [
        event.confidence,
        ...event.observations.map(
          (item) => item.confidence,
        ),
        ...event.people.flatMap((item) => [
          item.confidence,
          item.roleConfidence,
          item.appearance.confidence,
        ]),
        ...event.vehicles.flatMap((item) => [
          item.confidence,
          item.appearance.confidence,
        ]),
        ...event.vehicles.flatMap((item) =>
          item.plateSuggestion
            ? [item.plateSuggestion.confidence]
            : [],
        ),
        ...event.objects.map(
          (item) => item.confidence,
        ),
        ...event.stateObservations.map(
          (item) => item.confidence,
        ),
        ...event.sessionSignals.map(
          (item) => item.confidence,
        ),
        ...event.entityRelations.map(
          (item) => item.confidence,
        ),
        event.sceneComplexity.actionAssignmentConfidence,
        event.sceneComplexity.confidence,
      ];

      confidenceValues.forEach((value, index) => {
        if (value < 0 || value > 1) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Confiança fora do intervalo 0..1 no índice ${index}.`,
          });
        }
      });

      if (
        event.headline.trim().length < 3 ||
        event.headline.length > 120
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "O título deve ter entre 3 e 120 caracteres.",
        });
      }

      if (
        event.summary.trim().length < 1 ||
        event.summary.length > 800
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "O resumo deve ter entre 1 e 800 caracteres.",
        });
      }

      if (event.observations.length > 80) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Observações demais.",
        });
      }

      if (
        event.people.length > 50 ||
        event.vehicles.length > 50
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Entidades demais.",
        });
      }

      if (
        event.objects.length > 80 ||
        event.tags.length > 30 ||
        event.sessionSignals.length > 30 ||
        event.entityRelations.length > 80
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Objetos, sinais de sessão ou tags demais.",
        });
      }
    },
  );

function normalizeConfidence(value: unknown) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return value;
  }

  if (parsed < 0) {
    return 0;
  }

  if (parsed <= 1) {
    return parsed;
  }

  if (parsed <= 1.5) {
    return 1;
  }

  if (parsed <= 100) {
    return Math.min(1, parsed / 100);
  }

  return 1;
}

function normalizeDirectConfidenceFields(
  value: Record<string, unknown>,
) {
  const observations = Array.isArray(value.observations)
    ? value.observations.map((observation) => {
        if (
          !observation ||
          typeof observation !== "object" ||
          Array.isArray(observation)
        ) {
          return observation;
        }

        const item = observation as Record<string, unknown>;
        return {
          ...item,
          confidence: normalizeConfidence(item.confidence),
        };
      })
    : value.observations;

  const people = Array.isArray(value.people)
    ? value.people.map((person) => {
        if (
          !person ||
          typeof person !== "object" ||
          Array.isArray(person)
        ) {
          return person;
        }

        const item = person as Record<string, unknown>;
        return {
          ...item,
          roleConfidence: normalizeConfidence(
            item.roleConfidence,
          ),
          confidence: normalizeConfidence(
            item.confidence,
          ),
        };
      })
    : value.people;

  const vehicles = Array.isArray(value.vehicles)
    ? value.vehicles.map((vehicle) => {
        if (
          !vehicle ||
          typeof vehicle !== "object" ||
          Array.isArray(vehicle)
        ) {
          return vehicle;
        }

        const item = vehicle as Record<string, unknown>;
        const plateSuggestion =
          item.plateSuggestion &&
          typeof item.plateSuggestion === "object" &&
          !Array.isArray(item.plateSuggestion)
            ? {
                ...(item.plateSuggestion as Record<
                  string,
                  unknown
                >),
                confidence: normalizeConfidence(
                  (
                    item.plateSuggestion as Record<
                      string,
                      unknown
                    >
                  ).confidence,
                ),
              }
            : item.plateSuggestion;

        return {
          ...item,
          plateSuggestion,
          confidence: normalizeConfidence(
            item.confidence,
          ),
        };
      })
    : value.vehicles;

  const objects = Array.isArray(value.objects)
    ? value.objects.map((object) => {
        if (
          !object ||
          typeof object !== "object" ||
          Array.isArray(object)
        ) {
          return object;
        }

        const item = object as Record<string, unknown>;
        return {
          ...item,
          confidence: normalizeConfidence(
            item.confidence,
          ),
        };
      })
    : value.objects;

  return {
    ...value,
    observations,
    people,
    vehicles,
    objects,
    confidence: normalizeConfidence(
      value.confidence,
    ),
  };
}

export const AnalyzedEventSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }

    const event = normalizeDirectConfidenceFields(
      value as Record<string, unknown>,
    );

    if (
      event.schemaVersion === "1.1" ||
      event.schemaVersion === "1.2" ||
      event.schemaVersion === "1.3" ||
      event.schemaVersion === "1.4"
    ) {
      const people = Array.isArray(event.people)
        ? event.people.map((person) => {
            if (!person || typeof person !== "object" || Array.isArray(person)) {
              return person;
            }
            const item = person as Record<string, unknown>;
            return {
              ...item,
              appearance:
                item.appearance &&
                typeof item.appearance === "object" &&
                !Array.isArray(item.appearance)
                  ? item.appearance
                  : EmptyPersonAppearance,
            };
          })
        : [];

      const vehicles = Array.isArray(event.vehicles)
        ? event.vehicles.map((vehicle) => {
            if (!vehicle || typeof vehicle !== "object" || Array.isArray(vehicle)) {
              return vehicle;
            }
            const item = vehicle as Record<string, unknown>;
            return {
              ...item,
              appearance:
                item.appearance &&
                typeof item.appearance === "object" &&
                !Array.isArray(item.appearance)
                  ? item.appearance
                  : EmptyVehicleAppearance,
            };
          })
        : [];

      return {
        ...event,
        schemaVersion: "1.5",
        people,
        vehicles,
        stateObservations: Array.isArray(event.stateObservations)
          ? event.stateObservations
          : [],
        sessionSignals: Array.isArray(event.sessionSignals)
          ? event.sessionSignals
          : [],
        entityRelations: Array.isArray(event.entityRelations)
          ? event.entityRelations
          : [],
        sceneComplexity:
          event.sceneComplexity &&
          typeof event.sceneComplexity === "object" &&
          !Array.isArray(event.sceneComplexity)
            ? event.sceneComplexity
            : EmptySceneComplexity,
      };
    }

    return event;
  },
  ValidatedAnalyzedEventSchema,
);

export type PlateSuggestion = z.infer<
  typeof AnalyzedEventTransportSchema
>["vehicles"][number]["plateSuggestion"];

export type AnalyzedEvent = z.infer<
  typeof AnalyzedEventSchema
>;
