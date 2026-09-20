export type RecordingPlanCode = "basic" | "standard" | "intensive";

export type RecordingFrameLabel = "start" | "peak" | "end" | "extra";

export type RecordingPoint = { x: number; y: number };

export type RecordingSchedule =
  | { mode: "always" }
  | {
      mode: "weekly";
      weekly: Array<{ day: number; start: string; end: string }>;
      outsideMode: "off" | "significant_only";
    };

export type RecordingCameraConfig = {
  cameraId: string;
  cameraName: string;
  siteName: string;
  sourceKind: "local_recording";
  planCode: RecordingPlanCode;
  timezone: string;
  captureIntervalSeconds: number;
  consolidationIntervalSeconds: number;
  motionStartThreshold: number;
  motionContinueThreshold: number;
  eventCloseAfterSeconds: number;
  motionAdaptiveEnabled: boolean;
  motionOverlayMask:
    | "auto"
    | "none"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  motionStartConsecutiveFrames: number;
  motionEndConsecutiveFrames: number;
  motionCooldownSeconds: number;
  monitoringSchedule: RecordingSchedule;
  motionIgnorePolygons: RecordingPoint[][];
  maximumAnalysisFrames: number;
  clipEnabled: boolean;
  clipDurationSeconds: number | null;
  clipRetentionDays: number | null;
  entitlement: {
    accessSource: string;
    monitoringAllowed: boolean;
    periodStartsAt: string | null;
    periodEndsAt: string | null;
    reason: string;
  };
};

export type RecordingVideoInfo = {
  durationSeconds: number;
  durationKnown: boolean;
  width: number | null;
  height: number | null;
  codec: string | null;
  decoderMode: "native" | "compatibility";
  nativePreview: boolean;
};

export type RecordingEvidenceFrame = {
  label: RecordingFrameLabel;
  offsetSeconds: number;
  capturedAt: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  byteSize: number;
};

export type RecordingCandidate = {
  eventId: string;
  startedAt: string;
  endedAt: string;
  startedAtSeconds: number;
  endedAtSeconds: number;
  localMetrics: Record<string, unknown>;
  evidence: Array<{
    label: RecordingFrameLabel;
    offsetSeconds: number;
  }>;
};

export type RecordingPreparedEvent = Omit<RecordingCandidate, "evidence"> & {
  frames: RecordingEvidenceFrame[];
};

export type RecordingScanResult = {
  durationSeconds: number;
  candidates: RecordingPreparedEvent[];
  mappingMs: number;
  decoderMode: "native" | "compatibility";
};
