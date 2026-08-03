import { z } from "zod";
import { PointSchema } from "./camera-profile-point";
import { CameraVisualEntitySchema } from "./visual-state";

export { PointSchema } from "./camera-profile-point";

export const PersonRoleHintSchema = z.enum([
  "none",
  "staff",
  "customer",
  "delivery_person",
  "visitor",
  "shared",
]);

export const CameraZoneSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    type: z.enum([
      "entry",
      "exit",
      "service",
      "restricted",
      "ignore",
      "general",
    ]),
    personRoleHint: PersonRoleHintSchema.default("none"),
    polygon: z.array(PointSchema).min(3).max(50),
    description: z.string().trim().max(500),
  })
  .strict();

export const CameraProfileSchema = z
  .object({
    cameraId: z.string().uuid(),
    profileVersion: z.number().int().positive(),
    environmentDescription: z.string().trim().min(1).max(2000),
    monitoringGoals: z
      .array(z.string().trim().min(1).max(300))
      .min(1)
      .max(30),
    ignoreInstructions: z
      .array(z.string().trim().min(1).max(300))
      .max(30),
    zones: z.array(CameraZoneSchema).max(50),
    visualEntities: z
      .array(CameraVisualEntitySchema)
      .max(30)
      .default([]),
    timezone: z.string().trim().min(1).max(100),
  })
  .strict();

export type CameraProfile = z.infer<
  typeof CameraProfileSchema
>;
