export type RemoteCamera = {
  id: string;
  name: string;
  description: string;
  status: string;
  plan: string;
  captureIntervalSeconds: number;
  consolidationIntervalSeconds: number;
  motionStartThreshold: number;
  motionContinueThreshold: number;
  eventCloseAfterSeconds: number;
  monitoringGoals: string[];
  monitoringEnabled: boolean;
  activeProfileId: string | null;
  activeProfileVersion: number | null;
};

export type PairResponse = {
  ok: true;
  agent: {
    id: string;
    token: string;
  };
  camera: Omit<
    RemoteCamera,
    | "description"
    | "status"
    | "monitoringEnabled"
    | "activeProfileId"
    | "activeProfileVersion"
  > & {
    organizationId: string;
    siteId: string;
  };
};

export type ConfigResponse = {
  ok: true;
  agent: {
    id: string;
    name: string;
  };
  cameras: RemoteCamera[];
  serverTime: string;
};

export type ProtectedCameraConfig = {
  protectedRtsp: string;
  configuredAt: string;
  lastSnapshotUploadedAt?: string;
};

export type StoredAgentConfig = {
  schemaVersion: 1;
  apiBaseUrl: string;
  agentId: string;
  agentName: string;
  protectedAgentToken: string;
  pairedAt: string;
  cameras: Record<string, ProtectedCameraConfig>;
};

export type CapturedFrame = {
  path: string;
  width: number | null;
  height: number | null;
  byteSize: number;
  capturedAt: string;
};

export type LocalEventFrame = {
  label: "start" | "peak" | "end" | "extra";
  frame: CapturedFrame;
};

export type LocalMotionEvent = {
  eventId: string;
  cameraId: string;
  cameraName: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string;
  localMetrics: {
    peakMotionPercent: number;
    meanMotionPercent: number;
    durationSeconds: number;
    framesObserved: number;
    motionStartThreshold: number;
    motionContinueThreshold: number;
    closeReason: string;
  };
  frames: LocalEventFrame[];
};

export type CaptureSessionResponse = {
  ok: true;
  action: "started" | "ended";
  sessionId: string;
  startedAt?: string;
  framesObserved?: number;
  eventsCreated?: number;
};

export type EventSubmissionResponse = {
  ok: true;
  duplicate: boolean;
  pending: boolean;
  analysisJobId: string;
  relevant: boolean | null;
  eventId: string | null;
  summary: string | null;
  type: string | null;
  confidence: number | null;
  requiresReview: boolean;
};
