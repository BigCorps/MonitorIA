import { z } from "zod";

export const AppearanceColorSchema = z.enum([
  "black",
  "white",
  "gray",
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

export const HairColorSchema = z.enum([
  "black",
  "brown",
  "blond",
  "red",
  "gray",
  "white",
  "other",
  "unknown",
]);

export const HairLengthSchema = z.enum([
  "shaved",
  "short",
  "medium",
  "long",
  "covered",
  "unknown",
]);

export const FacialHairSchema = z.enum([
  "none",
  "stubble",
  "mustache",
  "beard",
  "mustache_and_beard",
  "unknown",
]);

export const EyewearSchema = z.enum([
  "none",
  "glasses",
  "sunglasses",
  "unknown",
]);

export const BodyBuildSchema = z.enum([
  "slim",
  "average",
  "robust",
  "unknown",
]);

export const HeadwearSchema = z.enum([
  "none",
  "cap",
  "hat",
  "helmet",
  "hood",
  "other",
  "unknown",
]);

export const ClothingTypeSchema = z.enum([
  "tshirt",
  "shirt",
  "polo",
  "blouse",
  "jacket",
  "sweater",
  "dress",
  "uniform",
  "shorts",
  "pants",
  "skirt",
  "other",
  "unknown",
]);

export const PersonAppearanceVisibilitySchema = z.enum([
  "clear",
  "partial",
  "poor",
  "not_visible",
]);

export const PersonAppearanceSchema = z
  .object({
    upperClothingColor: AppearanceColorSchema,
    lowerClothingColor: AppearanceColorSchema,
    upperClothingType: ClothingTypeSchema,
    lowerClothingType: ClothingTypeSchema,
    hairColor: HairColorSchema,
    hairLength: HairLengthSchema,
    facialHair: FacialHairSchema,
    eyewear: EyewearSchema,
    bodyBuild: BodyBuildSchema,
    headwear: HeadwearSchema,
    distinctiveVisibleFeatures: z
      .array(z.string().trim().min(1).max(80))
      .max(6),
    visibility: PersonAppearanceVisibilitySchema,
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const EmptyPersonAppearance = {
  upperClothingColor: "unknown",
  lowerClothingColor: "unknown",
  upperClothingType: "unknown",
  lowerClothingType: "unknown",
  hairColor: "unknown",
  hairLength: "unknown",
  facialHair: "unknown",
  eyewear: "unknown",
  bodyBuild: "unknown",
  headwear: "unknown",
  distinctiveVisibleFeatures: [],
  visibility: "not_visible",
  confidence: 0,
} as const;

export const CameraStaffProfileSchema = z
  .object({
    id: z.string().uuid(),
    label: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
    appearanceSignature: z.record(z.unknown()),
    zoneIds: z.array(z.string().uuid()).max(20),
    minSimilarity: z.number().min(0.5).max(1),
  })
  .strict();

export type PersonAppearance = z.infer<
  typeof PersonAppearanceSchema
>;

export type CameraStaffProfile = z.infer<
  typeof CameraStaffProfileSchema
>;
