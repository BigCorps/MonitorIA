export const CHILD_SAFETY_MONITORING_GOAL =
  "PROINF_CHILD_ADULT_CLASSIFICATION";

export function childSafetyClassificationEnabled(
  profile: { monitoringGoals?: string[] | null },
) {
  return (profile.monitoringGoals ?? []).some(
    (goal) =>
      String(goal).trim().toUpperCase() ===
      CHILD_SAFETY_MONITORING_GOAL,
  );
}

export function publicMonitoringGoals(
  goals: string[] | null | undefined,
) {
  return (goals ?? []).filter(
    (goal) =>
      String(goal).trim().toUpperCase() !==
      CHILD_SAFETY_MONITORING_GOAL,
  );
}

export function normalizeChildSafetyOutput(
  value: unknown,
  enabled: boolean,
): unknown {
  if (
    enabled ||
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return value;
  }

  const event = value as Record<string, unknown>;
  const people = Array.isArray(event.people)
    ? event.people.map((person) => {
        if (
          !person ||
          typeof person !== "object" ||
          Array.isArray(person)
        ) {
          return person;
        }

        return {
          ...(person as Record<string, unknown>),
          apparentAgeGroup: "unknown",
          apparentAgeGroupConfidence: 0,
        };
      })
    : event.people;

  return {
    ...event,
    people,
  };
}
