import { generalSignupEnabled } from "@/src/lib/release";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type ReleaseGateCheck = {
  code: string;
  area: string;
  status: "passed" | "warning" | "blocked";
  detail: string;
};

export type ReleaseGateOverview = {
  available: boolean;
  status: "ready" | "blocked" | "not_evaluated";
  commitSha: string | null;
  passedCount: number;
  warningCount: number;
  blockedCount: number;
  evaluatedAt: string | null;
  checks: ReleaseGateCheck[];
  generalSignupEnabled: boolean;
};

function checksValue(value: unknown): ReleaseGateCheck[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const status = String(row.status);
    if (!["passed", "warning", "blocked"].includes(status)) return [];
    return [{
      code: String(row.code ?? "unknown"),
      area: String(row.area ?? "Verificação"),
      status: status as ReleaseGateCheck["status"],
      detail: String(row.detail ?? ""),
    }];
  });
}

export async function getReleaseGateOverview(): Promise<ReleaseGateOverview> {
  const base = {
    generalSignupEnabled: generalSignupEnabled(),
  };
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("release_gate_runs")
    .select("status,commit_sha,passed_count,warning_count,blocked_count,checks,evaluated_at")
    .order("evaluated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      ...base,
      available: false,
      status: "not_evaluated",
      commitSha: null,
      passedCount: 0,
      warningCount: 0,
      blockedCount: 0,
      evaluatedAt: null,
      checks: [],
    };
  }

  return {
    ...base,
    available: true,
    status: data?.status === "ready" ? "ready" : data ? "blocked" : "not_evaluated",
    commitSha: data?.commit_sha ? String(data.commit_sha) : null,
    passedCount: Number(data?.passed_count ?? 0),
    warningCount: Number(data?.warning_count ?? 0),
    blockedCount: Number(data?.blocked_count ?? 0),
    evaluatedAt: data?.evaluated_at ? String(data.evaluated_at) : null,
    checks: checksValue(data?.checks),
  };
}
