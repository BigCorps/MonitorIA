export const PROCESS_INSTANCE_STATUSES = [
  "open",
  "completed",
  "incomplete",
  "uncertain",
  "aborted",
] as const;

export type ProcessInstanceStatus =
  (typeof PROCESS_INSTANCE_STATUSES)[number];

export const PROCESS_STEP_STATUSES = [
  "pending",
  "observed",
  "missing",
  "skipped",
  "ambiguous",
  "out_of_order",
  "unexpected",
] as const;

export type ProcessStepStatus =
  (typeof PROCESS_STEP_STATUSES)[number];

export const PROCESS_DEVIATION_CODES = [
  "missing_required_step",
  "out_of_order_step",
  "unexpected_step",
  "duration_high",
  "duration_low",
  "stalled",
  "ambiguous_result",
] as const;

export type ProcessDeviationCode =
  (typeof PROCESS_DEVIATION_CODES)[number];

export type OperationalProcessDefinition = {
  id: string;
  processCode: string;
  name: string;
  description: string;
  sessionType: string;
  source: "system" | "organization" | "site" | "camera";
  strictness: "flexible" | "balanced" | "strict";
  status: "draft" | "active" | "paused" | "archived";
  version: number;
  steps: OperationalProcessDefinitionStep[];
};

export type OperationalProcessDefinitionStep = {
  id: string;
  stepCode: string;
  name: string;
  sortOrder: number;
  required: boolean;
  repeatable: boolean;
  terminal: boolean;
  acceptedChapterTypes: string[];
  minimumConfidence: number;
};

export type OperationalProcessInstanceStep = {
  id: string;
  stepCode: string;
  stepName: string;
  expectedOrder: number;
  observedOrder: number | null;
  status: ProcessStepStatus;
  observedAt: string | null;
  confidence: number;
  eventId: string | null;
  evidenceEventIds: string[];
  metadata: Record<string, unknown>;
};

export type OperationalProcessInstance = {
  id: string;
  organizationId: string;
  siteId: string;
  cameraId: string;
  cameraName: string;
  processDefinitionId: string;
  operationalSessionId: string;
  processCode: string;
  processName: string;
  status: ProcessInstanceStatus;
  resultCode: string;
  startedAt: string;
  lastObservedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  requiredStepsTotal: number;
  requiredStepsCompleted: number;
  observedStepsCount: number;
  unexpectedStepsCount: number;
  progressRatio: number;
  nextExpectedStepCode: string | null;
  confidence: number;
  title: string;
  summary: string;
  steps: OperationalProcessInstanceStep[];
};

export type OperationalProcessDeviation = {
  id: string;
  processInstanceId: string;
  cameraId: string;
  cameraName: string;
  deviationCode: ProcessDeviationCode;
  status: "active" | "resolved" | "dismissed" | "informational";
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  summary: string;
  confidence: number;
  observedAt: string;
  resolvedAt: string | null;
  evidenceEventIds: string[];
  data: Record<string, unknown>;
};

export type OperationalProcessOverview = {
  definitions: OperationalProcessDefinition[];
  instances: OperationalProcessInstance[];
  deviations: OperationalProcessDeviation[];
  summary: {
    totalProcesses: number;
    openProcesses: number;
    completedProcesses: number;
    incompleteProcesses: number;
    activeDeviations: number;
    importantDeviations: number;
  };
};
