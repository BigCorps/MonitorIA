import { z } from "zod";

export const CameraHealthStatusSchema = z.enum([
  "unknown",
  "learning",
  "healthy",
  "degraded",
  "critical",
  "offline",
]);

export const CameraHealthIncidentTypeSchema = z.enum([
  "baseline_required",
  "no_recent_observation",
  "possible_frame_freeze",
  "lens_obstructed",
  "low_light",
  "overexposed",
  "blurry",
  "frame_shifted",
  "profile_drift",
  "image_degraded",
]);

export const CameraHealthMetricsSchema = z.object({
  capturedAt: z.string().datetime({ offset: true }),
  source: z.enum(["periodic", "startup", "manual", "event"]).default("periodic"),
  width: z.number().int().min(1).max(7680).nullable(),
  height: z.number().int().min(1).max(4320).nullable(),
  brightnessMean: z.number().min(0).max(255),
  contrastStddev: z.number().min(0).max(255),
  edgeDensity: z.number().min(0).max(1),
  blurScore: z.number().min(0).max(1_000_000),
  darkPixelRatio: z.number().min(0).max(1),
  brightPixelRatio: z.number().min(0).max(1),
  gridSignature: z.array(z.number().int().min(0).max(255)).length(144),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  metadata: z.record(z.unknown()).default({}),
});

export type CameraHealthStatus = z.infer<typeof CameraHealthStatusSchema>;
export type CameraHealthIncidentType = z.infer<typeof CameraHealthIncidentTypeSchema>;
export type CameraHealthMetrics = z.infer<typeof CameraHealthMetricsSchema>;
