export type OperationalAlertSeverity = "info" | "warning" | "critical";
export type OperationalAlertStatus = "open" | "acknowledged" | "resolved";

export type OperationalAlert = {
  id: string;
  source: "operational" | "intelligent";
  code: string;
  severity: OperationalAlertSeverity;
  status: OperationalAlertStatus;
  title: string;
  summary: string;
  cameraId: string | null;
  cameraName: string | null;
  agentId: string | null;
  agentName: string | null;
  siteName: string | null;
  siteTimezone: string | null;
  condition: Record<string, unknown>;
  evidence: Record<string, unknown>;
  firstObservedAt: string;
  lastObservedAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  confidence: number | null;
  reason: string | null;
  recommendation: string | null;
  evidenceEventIds: string[];
  sourceEntityType: string | null;
  sourceEntityId: string | null;
};

export type OperationalAlertOverview = {
  active: OperationalAlert[];
  recentResolved: OperationalAlert[];
  counts: {
    total: number;
    critical: number;
    warning: number;
    acknowledged: number;
  };
};

export type CrossCameraJourney = {
  id: string;
  subjectType: "person" | "vehicle";
  siteName: string;
  fromCameraName: string;
  toCameraName: string;
  fromEventId: string;
  toEventId: string;
  observedFrom: string;
  observedTo: string;
  travelSeconds: number;
  probableDirection: string;
  confidence: number;
  summary: string;
  competingHypotheses: Array<Record<string, unknown>>;
};
