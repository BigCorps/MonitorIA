export type NormalizedPoint = {
  x: number;
  y: number;
};

export type MonitoringSchedule = {
  mode: "always" | "weekly";
  weekly?: Array<{
    day: number;
    start: string;
    end: string;
  }>;
  outsideMode?: "off" | "significant_only";
};

export type RemoteCamera = {
  id: string;
  name: string;
  description: string;
  status: string;
  plan: "basic" | "standard" | "intensive";
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
  monitoringSchedule: MonitoringSchedule;
  motionIgnorePolygons: NormalizedPoint[][];
  monitoringGoals: string[];
  monitoringEnabled: boolean;
  activeProfileId: string | null;
  activeProfileVersion: number | null;
  accessSource?: string;
  monitoringAllowed?: boolean;
  longTermKeyframes?: number | null;
  temporaryFrameDays?: number | null;
  maximumAnalysisFrames?: number | null;
  clipEnabled?: boolean;
  clipDurationSeconds?: number | null;
  clipRetentionDays?: number | null;
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
    | "timezone"
    | "motionAdaptiveEnabled"
    | "motionOverlayMask"
    | "motionStartConsecutiveFrames"
    | "motionEndConsecutiveFrames"
    | "motionCooldownSeconds"
    | "monitoringSchedule"
    | "motionIgnorePolygons"
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
    planCode: "basic" | "standard" | "intensive";
    peakMotionPercent: number;
    meanMotionPercent: number;
    rawPeakMotionPercent: number;
    durationSeconds: number;
    framesObserved: number;
    configuredStartThreshold: number;
    configuredContinueThreshold: number;
    effectiveStartThreshold: number;
    effectiveContinueThreshold: number;
    noiseP50Percent: number;
    noiseP90Percent: number;
    noiseP95Percent: number;
    ignoredPixelPercent: number;
    autoIgnoredCellCount: number;
    startConsecutiveFrames: number;
    endConsecutiveFrames: number;
    cooldownSeconds: number;
    chapterMinimumSeconds: number;
    chapterMaximumSeconds: number;
    regionShiftThreshold: number;
    dominantRegion: string | null;
    motionCentroidX: number | null;
    motionCentroidY: number | null;
    motionRegionCount: number;
    motionSpreadPercent: number;
    motionDensityPercent: number;
    startMeanLuma: number;
    maxDirectionalChangeRatio: number;
    suppressedCameraNoiseSamples: number;
    closeReason: string;
    sourceFrameCount?: number;
    submittedFrameCount?: number;
    submittedFrameLabels?: string[];
    droppedFrameLabels?: string[];
    reencodedFrameLabels?: string[];
    submittedEvidenceBytes?: number;
    evidenceBudgetBytes?: number;
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

export type ClipUploadRequest = {
  requestId: string;
  assetId: string;
  eventId: string;
  signedUrl: string;
  storagePath: string;
  clipStartsAt: string;
  clipEndsAt: string;
  durationSeconds: number;
  uploadExpiresAt: string;
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
  clipRequest?: ClipUploadRequest | null;
};
