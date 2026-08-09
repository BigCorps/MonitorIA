import type { AnalyzedEvent } from "@/src/contracts/analyzed-event";

type Zone = {
  id: string;
  personRoleHint: string;
};

const SERVICE_SIGNALS = new Set([
  "service_started",
  "service_continued",
  "object_handoff_to_staff",
  "object_handoff_to_customer",
  "terminal_activity",
  "waiting",
]);

function hasRoleSignal(
  signals: AnalyzedEvent["sessionSignals"],
  role: "staff" | "customer" | "delivery_person",
) {
  return signals.some(
    (signal) =>
      SERVICE_SIGNALS.has(signal.type) &&
      (signal.actorRole === role || signal.targetRole === role),
  );
}

export type OperationalPersonClassification = {
  modelRole: AnalyzedEvent["people"][number]["role"];
  operationalRole: AnalyzedEvent["people"][number]["role"];
  engagedAtCounter: boolean;
  reason: string;
};

export function classifyOperationalPerson(input: {
  person: AnalyzedEvent["people"][number];
  sessionSignals: AnalyzedEvent["sessionSignals"];
  zones: Zone[];
}): OperationalPersonClassification {
  const { person, sessionSignals } = input;
  const zoneHints = new Set(
    input.zones
      .filter((zone) => person.zoneIds.includes(zone.id))
      .map((zone) => zone.personRoleHint),
  );
  const inStaffArea = zoneHints.has("staff");
  const atCounter = zoneHints.has("shared");
  const inCustomerLane = zoneHints.has("customer");
  const inExternalArea = zoneHints.has("visitor");
  const staffSignal = hasRoleSignal(sessionSignals, "staff");
  const customerSignal =
    hasRoleSignal(sessionSignals, "customer") ||
    hasRoleSignal(sessionSignals, "delivery_person");
  const engagedAtCounter =
    atCounter && customerSignal;

  if (
    (person.role === "staff" &&
      (inStaffArea || atCounter || person.roleConfidence >= 0.82)) ||
    (inStaffArea && staffSignal)
  ) {
    return {
      modelRole: person.role,
      operationalRole: "staff",
      engagedAtCounter: false,
      reason: "staff_area_or_activity",
    };
  }

  if (
    engagedAtCounter &&
    (person.role === "customer" ||
      person.role === "delivery_person" ||
      person.role === "unknown")
  ) {
    return {
      modelRole: person.role,
      operationalRole:
        person.role === "delivery_person"
          ? "delivery_person"
          : "customer",
      engagedAtCounter: true,
      reason: "counter_engagement",
    };
  }

  if (person.role === "delivery_person" && customerSignal) {
    return {
      modelRole: person.role,
      operationalRole: "delivery_person",
      engagedAtCounter: atCounter,
      reason: "delivery_signal",
    };
  }

  if (inExternalArea || inCustomerLane || person.role === "customer") {
    return {
      modelRole: person.role,
      operationalRole: "visitor",
      engagedAtCounter: false,
      reason: "passage_without_counter_engagement",
    };
  }

  return {
    modelRole: person.role,
    operationalRole: person.role,
    engagedAtCounter: false,
    reason: "model_role_preserved",
  };
}
