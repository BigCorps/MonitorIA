import type { AnalyzedEvent } from "../contracts/analyzed-event.js";
import type { CameraProfile } from "../contracts/camera-profile.js";

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

export interface VisionProvider {
  analyzeEvent(input: AnalyzeEventInput): Promise<VisionAnalysisResult>;
}
