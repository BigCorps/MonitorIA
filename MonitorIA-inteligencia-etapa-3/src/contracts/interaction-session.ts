import { z } from "zod";

export const SessionSignalTypeSchema = z.enum([
  "arrival",
  "waiting",
  "service_started",
  "service_continued",
  "terminal_activity",
  "object_handoff_to_staff",
  "object_handoff_to_customer",
  "departure",
  "opening_step",
  "closing_step",
  "equipment_activity",
  "restricted_access",
  "state_change",
  "other",
]);

export const SessionActorRoleSchema = z.enum([
  "staff",
  "customer",
  "delivery_person",
  "visitor",
  "unknown",
]);

export const SessionSignalSchema = z
  .object({
    type: SessionSignalTypeSchema,
    actorRole: SessionActorRoleSchema,
    targetRole: SessionActorRoleSchema.nullable(),
    objectLabel: z.string().trim().max(120).nullable(),
    offsetSeconds: z.number().min(0),
    description: z.string().trim().min(1).max(320),
    zoneIds: z.array(z.string()).max(20),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const OperationalSessionTypeSchema = z.enum([
  "customer_service",
  "delivery_or_pickup",
  "visitor_stay",
  "staff_activity",
  "equipment_operation",
  "restricted_area_access",
  "opening_procedure",
  "closing_procedure",
  "other",
]);

export const OperationalSessionStatusSchema = z.enum([
  "open",
  "completed",
  "closed_by_inactivity",
  "uncertain",
]);

export const OperationalSessionChapterTypeSchema = z.enum([
  "arrival",
  "waiting",
  "service_started",
  "service_continued",
  "terminal_activity",
  "object_handoff",
  "departure",
  "opening_step",
  "closing_step",
  "equipment_activity",
  "restricted_access",
  "state_change",
  "presence",
  "other",
]);

export type SessionSignal = z.infer<typeof SessionSignalSchema>;
export type OperationalSessionType = z.infer<
  typeof OperationalSessionTypeSchema
>;
export type OperationalSessionStatus = z.infer<
  typeof OperationalSessionStatusSchema
>;
export type OperationalSessionChapterType = z.infer<
  typeof OperationalSessionChapterTypeSchema
>;
