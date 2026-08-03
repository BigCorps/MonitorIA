import { z } from "zod";
import { PointSchema } from "./camera-profile-point";

export const VisualEntityTypeSchema = z.enum([
  "access_barrier",
  "container",
  "reference_object",
  "equipment",
  "activity_area",
  "lighting_reference",
]);

export const VisualStateSchema = z.enum([
  "unknown",
  "closed",
  "partially_open",
  "opening",
  "open",
  "closing",
  "locked",
  "unlocked",
  "present",
  "absent",
  "moved",
  "returned",
  "replaced",
  "on",
  "off",
  "in_use",
  "idle",
  "stopped",
  "empty",
  "occupied",
  "busy",
  "blocked",
  "clear",
]);

export const VisualStateVisibilitySchema = z.enum([
  "clear",
  "partial",
  "blurred",
  "too_small",
  "occluded",
  "not_visible",
]);

export const VisualStateDefinitionSchema = z
  .object({
    state: VisualStateSchema,
    description: z.string().trim().min(1).max(500),
  })
  .strict();

export const CameraVisualEntitySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    type: VisualEntityTypeSchema,
    polygon: z.array(PointSchema).min(3).max(50),
    stateDefinitions: z
      .array(VisualStateDefinitionSchema)
      .min(2)
      .max(12),
    primaryOperationalMarker: z.boolean(),
    minConfidence: z.number().min(0.5).max(1),
    reliability: z.enum(["high", "medium", "low"]),
  })
  .strict();

export const VisualStateObservationSchema = z
  .object({
    entityId: z.string().uuid(),
    observedState: VisualStateSchema,
    previousVisibleState: VisualStateSchema.nullable(),
    transitionVisible: z.boolean(),
    persistenceVisible: z.boolean(),
    description: z.string().trim().min(1).max(600),
    frameLabels: z
      .array(z.enum(["start", "peak", "end", "extra"]))
      .min(1)
      .max(4),
    visibility: VisualStateVisibilitySchema,
    confidence: z.number().min(0).max(1),
    limitations: z
      .array(z.string().trim().min(1).max(240))
      .max(5),
  })
  .strict();

export type VisualEntityType = z.infer<
  typeof VisualEntityTypeSchema
>;
export type VisualState = z.infer<typeof VisualStateSchema>;
export type CameraVisualEntity = z.infer<
  typeof CameraVisualEntitySchema
>;
export type VisualStateObservation = z.infer<
  typeof VisualStateObservationSchema
>;
