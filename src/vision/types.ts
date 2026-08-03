import type { AnalyzedEvent } from "../contracts/analyzed-event";
import type { CameraProfile } from "../contracts/camera-profile";
import type { CameraProfileDraft } from "../contracts/camera-profile-draft";
import type { AnalysisPlanCode } from "../lib/analysis-plans";
import type {
  VisionRouteCode,
  VisionRoutingDecision,
} from "./complexity-router";

export type VisionImageDetail = "low" | "high" | "auto";
export type VisionAnalysisMode =
  | "economic"
  | "balanced"
  | "detailed";

export interface EventFrame {
  label: "start" | "peak" | "end" | "extra";
  capturedAt: string;
  imageUrl: string;
}

export interface EventLocalMetrics {
  peakMotionPercent: number;
  meanMotionPercent: number;
  durationSeconds: number;
  framesObserved?: number;
  motionRegionCount?: number;
  motionSpreadPercent?: number;
  sceneChangePercent?: number;
  candidateEntityIds?: string[];
  outsideDeclaredHours?: boolean;
  afterConfirmedClosing?: boolean;
  dominantRegion?: string | null;
  closeReason?: string;
  deterministicDisposition?:
    | "none"
    | "ignore"
    | "reuse_state"
    | "await_more_frames";
  [key: string]: unknown;
}

export interface AnalyzeEventInput {
  organizationId: string;
  eventId: string;
  startedAt: string;
  endedAt: string;
  profile: CameraProfile;
  frames: EventFrame[];
  localMetrics: EventLocalMetrics;
  planCode?: AnalysisPlanCode;
  analysisMode?: VisionAnalysisMode;
  promptCacheKey?: string;
  routingDecision?: VisionRoutingDecision;
  verificationCandidate?: AnalyzedEvent;
}

export interface AnalyzeCameraProfileInput {
  organizationId: string;
  cameraId: string;
  cameraName: string;
  cameraDescription: string;
  siteName: string;
  timezone: string;
  capturedAt: string;
  initialMonitoringGoals: string[];
  userGuidance?: string;
  imageUrl: string;
}

export interface VisionUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
}

export interface VisionAnalysisResult {
  event: AnalyzedEvent;
  provider: string;
  model: string;
  responseId: string;
  usage: VisionUsage;
  latencyMs: number;
}

export interface VisionAnalysisAttempt
  extends VisionAnalysisResult {
  role: "primary" | "escalation" | "verifier" | "ab_candidate";
  route?: VisionRouteCode;
}

export interface VisionPlanOutcome {
  final: VisionAnalysisResult;
  attempts: VisionAnalysisAttempt[];
  escalated: boolean;
  verified: boolean;
  routing: VisionRoutingDecision;
}

export interface CameraProfileAnalysisResult {
  profile: CameraProfileDraft;
  provider: string;
  model: string;
  responseId: string;
  usage: VisionUsage;
  latencyMs: number;
}

export interface VisionProvider {
  analyzeEvent(
    input: AnalyzeEventInput,
  ): Promise<VisionAnalysisResult>;
  analyzeCameraProfile?(
    input: AnalyzeCameraProfileInput,
  ): Promise<CameraProfileAnalysisResult>;
}
