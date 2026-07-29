export type AgentAnalysisPlanCode = "basic" | "standard" | "intensive";

export type AgentPlan = {
  code: AgentAnalysisPlanCode;
  label: string;
  maximumFrames: number;
  maxWidth: number;
  jpegQuality: number;
};

export function normalizeAgentPlan(value: unknown): AgentAnalysisPlanCode {
  return value === "basic" || value === "intensive"
    ? value
    : "standard";
}

export function getAgentPlan(value: unknown): AgentPlan {
  const code = normalizeAgentPlan(value);

  if (code === "basic") {
    return {
      code,
      label: "Econômico",
      maximumFrames: 1,
      maxWidth: 960,
      jpegQuality: 6,
    };
  }

  if (code === "intensive") {
    return {
      code,
      label: "Detalhado",
      maximumFrames: 4,
      maxWidth: 1280,
      jpegQuality: 4,
    };
  }

  return {
    code: "standard",
    label: "Equilibrado",
    maximumFrames: 3,
    maxWidth: 960,
    jpegQuality: 5,
  };
}
