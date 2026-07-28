import { z } from "zod";

export const ProfilePointSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  })
  .strict();

export const SuggestedCameraZoneSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    type: z.enum([
      "entry",
      "exit",
      "service",
      "restricted",
      "ignore",
      "general",
    ]),
    description: z.string().trim().min(1).max(500),
    polygon: z.array(ProfilePointSchema).min(3).max(8),
  })
  .strict();

export const CameraImageQualitySchema = z
  .object({
    overall: z.enum(["good", "usable", "limited", "poor"]),
    lighting: z.string().trim().min(1).max(300),
    visibility: z.string().trim().min(1).max(300),
    limitations: z.array(z.string().trim().min(1).max(300)).max(8),
  })
  .strict();

export const CameraProfileDraftSchema = z
  .object({
    environmentDescription: z.string().trim().min(30).max(2000),
    sceneType: z.enum(["indoor", "outdoor", "mixed", "unknown"]),
    fixedElements: z.array(z.string().trim().min(1).max(250)).min(1).max(15),
    monitoringGoals: z.array(z.string().trim().min(1).max(300)).min(2).max(10),
    ignoreInstructions: z.array(z.string().trim().min(1).max(300)).max(10),
    zones: z.array(SuggestedCameraZoneSchema).min(1).max(6),
    privacyNotes: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
    imageQuality: CameraImageQualitySchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type CameraProfileDraft = z.infer<typeof CameraProfileDraftSchema>;
