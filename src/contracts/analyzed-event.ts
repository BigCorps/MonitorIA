import { z } from "zod";

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

// Schema deliberadamente simples para Structured Outputs.
// Restrições de tamanho/confiança são aplicadas depois pelo schema de domínio.
export const AnalyzedEventTransportSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
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
          upperClothingColor: z.string().nullable(),
          lowerClothingColor: z.string().nullable(),
          accessories: z.array(z.string()),
          carrying: z.array(z.string()),
          zoneIds: z.array(z.string()),
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
    zoneIds: z.array(z.string()),
    tags: z.array(z.string()),
    confidence: z.number(),
    requiresReview: z.boolean(),
    reviewReasons: z.array(z.string()),
  })
  .strict();

export const AnalyzedEventSchema = AnalyzedEventTransportSchema.superRefine(
  (event, context) => {
    const confidenceValues = [
      event.confidence,
      ...event.observations.map((item) => item.confidence),
      ...event.people.map((item) => item.confidence),
      ...event.vehicles.map((item) => item.confidence),
      ...event.vehicles.flatMap((item) =>
        item.plateSuggestion ? [item.plateSuggestion.confidence] : [],
      ),
      ...event.objects.map((item) => item.confidence),
    ];

    confidenceValues.forEach((value, index) => {
      if (value < 0 || value > 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Confiança fora do intervalo 0..1 no índice ${index}.`,
        });
      }
    });

    if (event.summary.trim().length < 1 || event.summary.length > 800) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O resumo deve ter entre 1 e 800 caracteres.",
      });
    }

    if (event.observations.length > 80) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Observações demais." });
    }
    if (event.people.length > 50 || event.vehicles.length > 50) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Entidades demais." });
    }
    if (event.objects.length > 80 || event.tags.length > 30) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Objetos ou tags demais." });
    }
  },
);

export type PlateSuggestion = z.infer<
  typeof AnalyzedEventTransportSchema
>["vehicles"][number]["plateSuggestion"];
export type AnalyzedEvent = z.infer<typeof AnalyzedEventSchema>;
