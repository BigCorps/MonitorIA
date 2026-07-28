import type { AnalyzedEvent } from "../contracts/analyzed-event";
import type { CameraProfile } from "../contracts/camera-profile";
import type { CameraProfileDraft } from "../contracts/camera-profile-draft";

export type VisionImageDetail = "low" | "high" | "auto";

export interface EventFrame {
  label: "start" | "peak" | "end" | "extra";
  capturedAt: string;
  imageUrl: string;
}

export interface AnalyzeEventInput {
  organizationId: string;
  eventId: string;
  startedAt: string;
  endedAt: string;
  profile: CameraProfile;
  frames: EventFrame[];
  localMetrics: {
    peakMotionPercent: number;
    meanMotionPercent: number;
    durationSeconds: number;
  };
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
  imageUrl: string;
}

export interface VisionUsage {
  inputTokens: number;
  outputTokens: number;
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

export interface CameraProfileAnalysisResult {
  profile: CameraProfileDraft;
  provider: string;
  model: string;
  responseId: string;
  usage: VisionUsage;
  latencyMs: number;
}

export interface VisionProvider {
  analyzeEvent(input: AnalyzeEventInput): Promise<VisionAnalysisResult>;
  analyzeCameraProfile?(
    input: AnalyzeCameraProfileInput,
  ): Promise<CameraProfileAnalysisResult>;
}
