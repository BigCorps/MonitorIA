export type AgentAnalysisPlanCode =
  | "basic"
  | "standard"
  | "intensive";

export type AgentPlan = {
  code: AgentAnalysisPlanCode;
  label: string;
  maximumFrames: number;
  maxWidth: number;
  jpegQuality: number;
  chapterMinimumSeconds: number;
  chapterMaximumSeconds: number;
  regionShiftThreshold: number;
};

export function normalizeAgentPlan(
  value: unknown,
): AgentAnalysisPlanCode {
  return value === "basic" ||
    value === "intensive"
    ? value
    : "standard";
}

export function getAgentPlan(
  value: unknown,
): AgentPlan {
  const code = normalizeAgentPlan(value);

  if (code === "basic") {
    return {
      code,
      label: "Econômico",
      maximumFrames: 1,
      maxWidth: 960,
      jpegQuality: 6,
      chapterMinimumSeconds: 60,
      chapterMaximumSeconds: 240,
      regionShiftThreshold: 0.35,
    };
  }

  if (code === "intensive") {
    return {
      code,
      label: "Detalhado",
      maximumFrames: 4,
      maxWidth: 1280,
      jpegQuality: 4,
      chapterMinimumSeconds: 60,
      chapterMaximumSeconds: 240,
      regionShiftThreshold: 0.28,
    };
  }

  return {
    code: "standard",
    label: "Equilibrado",
    maximumFrames: 3,
    maxWidth: 960,
    jpegQuality: 5,
    chapterMinimumSeconds: 45,
    chapterMaximumSeconds: 180,
    regionShiftThreshold: 0.3,
  };
}
