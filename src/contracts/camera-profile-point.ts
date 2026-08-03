import { z } from "zod";

export const PointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

export type CameraPoint = z.infer<typeof PointSchema>;
