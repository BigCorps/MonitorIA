import { z } from "zod";

export const CameraIntelligenceModeSchema = z.enum([
  "auto",
  "general",
  "entrance",
  "service_counter",
  "checkout",
  "parking",
  "warehouse",
  "corridor",
  "production",
  "restricted_area",
  "crowd",
]);

export const SceneDensitySchema = z.enum([
  "low",
  "normal",
  "high",
]);

export const CameraIntelligenceConfigSchema = z
  .object({
    mode: CameraIntelligenceModeSchema.default("auto"),
    sceneDensity: SceneDensitySchema.default("normal"),
    multiEntityEnabled: z.boolean().default(true),
    vehicleMemoryEnabled: z.boolean().default(true),
    complexityRoutingEnabled: z.boolean().default(true),
    verificationEnabled: z.boolean().default(true),
    strongThreshold: z.number().int().min(35).max(95).default(65),
    verificationThreshold: z
      .number()
      .int()
      .min(45)
      .max(100)
      .default(78),
    vehicleMemoryWindowMinutes: z
      .number()
      .int()
      .min(5)
      .max(720)
      .default(60),
    vehicleSimilarityThreshold: z
      .number()
      .min(0.5)
      .max(1)
      .default(0.76),
  })
  .strict();

export const DefaultCameraIntelligenceConfig = {
  mode: "auto",
  sceneDensity: "normal",
  multiEntityEnabled: true,
  vehicleMemoryEnabled: true,
  complexityRoutingEnabled: true,
  verificationEnabled: true,
  strongThreshold: 65,
  verificationThreshold: 78,
  vehicleMemoryWindowMinutes: 60,
  vehicleSimilarityThreshold: 0.76,
} as const;

export const NormalizedColorFamilySchema = z.enum([
  "black",
  "white",
  "gray",
  "silver",
  "blue",
  "green",
  "red",
  "burgundy",
  "brown",
  "beige",
  "yellow",
  "orange",
  "pink",
  "purple",
  "multicolor",
  "unknown",
]);

export const VehicleAppearanceSchema = z
  .object({
    colorFamily: NormalizedColorFamilySchema.default("unknown"),
    bodyStyle: z
      .enum([
        "sedan",
        "hatchback",
        "suv",
        "pickup",
        "coupe",
        "wagon",
        "minivan",
        "van",
        "truck",
        "bus",
        "motorcycle",
        "bicycle",
        "unknown",
      ])
      .default("unknown"),
    sizeClass: z
      .enum(["small", "medium", "large", "unknown"])
      .default("unknown"),
    orientation: z
      .enum([
        "front",
        "rear",
        "left_side",
        "right_side",
        "diagonal",
        "unknown",
      ])
      .default("unknown"),
    distinctiveVisibleFeatures: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([]),
    visibleAccessories: z
      .array(z.string().trim().min(1).max(80))
      .max(12)
      .default([]),
    confidence: z.number().min(0).max(1).default(0),
  })
  .strict();

export const EmptyVehicleAppearance = {
  colorFamily: "unknown",
  bodyStyle: "unknown",
  sizeClass: "unknown",
  orientation: "unknown",
  distinctiveVisibleFeatures: [],
  visibleAccessories: [],
  confidence: 0,
} as const;

export const SceneComplexitySchema = z
  .object({
    visiblePersonCount: z.number().int().min(0).max(100).default(0),
    visibleVehicleCount: z.number().int().min(0).max(100).default(0),
    simultaneousActionCount: z.number().int().min(0).max(100).default(0),
    crowdLevel: z
      .enum(["none", "low", "medium", "high"])
      .default("none"),
    occlusionLevel: z
      .enum(["none", "partial", "high"])
      .default("none"),
    identityAmbiguity: z
      .enum(["low", "medium", "high"])
      .default("low"),
    actionAssignmentConfidence: z.number().min(0).max(1).default(0),
    notes: z
      .array(z.string().trim().min(1).max(180))
      .max(12)
      .default([]),
    confidence: z.number().min(0).max(1).default(0),
  })
  .strict();

export const EmptySceneComplexity = {
  visiblePersonCount: 0,
  visibleVehicleCount: 0,
  simultaneousActionCount: 0,
  crowdLevel: "none",
  occlusionLevel: "none",
  identityAmbiguity: "low",
  actionAssignmentConfidence: 0,
  notes: [],
  confidence: 0,
} as const;

export const EntityRelationSchema = z
  .object({
    relationType: z.enum([
      "approaches",
      "enters",
      "exits",
      "waits_at",
      "interacts_with",
      "operates",
      "hands_object_to",
      "receives_object_from",
      "carries",
      "opens",
      "closes",
      "moves",
      "removes",
      "places",
      "occupies",
      "follows",
      "parks_near",
      "other",
    ]),
    subjectType: z.enum([
      "person",
      "vehicle",
      "object",
      "visual_entity",
    ]),
    subjectTrackId: z.string().trim().min(1).max(80),
    objectType: z
      .enum(["person", "vehicle", "object", "visual_entity", "zone"])
      .nullable(),
    objectTrackId: z.string().trim().min(1).max(80).nullable(),
    offsetSeconds: z.number().min(0).max(3600),
    zoneIds: z.array(z.string()).max(20),
    description: z.string().trim().min(1).max(300),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export type CameraIntelligenceConfig = z.infer<
  typeof CameraIntelligenceConfigSchema
>;
export type CameraIntelligenceMode = z.infer<
  typeof CameraIntelligenceModeSchema
>;
export type VehicleAppearance = z.infer<
  typeof VehicleAppearanceSchema
>;
export type SceneComplexity = z.infer<
  typeof SceneComplexitySchema
>;
export type EntityRelation = z.infer<
  typeof EntityRelationSchema
>;
