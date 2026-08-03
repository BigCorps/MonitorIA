import { z } from "zod";
import { VehicleAppearanceSchema } from "./scene-intelligence";

export const VehicleMemoryScopeSchema = z.enum([
  "visit",
  "parking_stay",
  "camera_window",
]);

export const VehicleMemoryInstanceSchema = z
  .object({
    id: z.string().uuid(),
    cameraId: z.string().uuid(),
    scope: VehicleMemoryScopeSchema,
    vehicleType: z.string().trim().min(1).max(40),
    firstSeenAt: z.string(),
    lastSeenAt: z.string(),
    appearance: VehicleAppearanceSchema,
    observationCount: z.number().int().positive(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type VehicleMemoryInstance = z.infer<
  typeof VehicleMemoryInstanceSchema
>;
