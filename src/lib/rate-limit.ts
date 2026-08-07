import { createHash } from "node:crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  retryAfterSeconds: number;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function consumeRateLimit(input: {
  scope: string;
  subject: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const subjectHash = createHash("sha256")
    .update(input.subject)
    .digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "consume_api_rate_limit_v1",
    {
      p_scope: input.scope,
      p_subject: subjectHash,
      p_limit: input.limit,
      p_window_seconds: input.windowSeconds,
    },
  );

  if (error) {
    throw new Error("rate_limit_unavailable", { cause: error });
  }

  const result = objectValue(data);
  return {
    allowed: result.allowed === true,
    remaining: Number(result.remaining ?? 0),
    resetAt: String(result.resetAt ?? ""),
    retryAfterSeconds: Math.max(
      1,
      Number(result.retryAfterSeconds ?? 1),
    ),
  };
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "Retry-After": String(result.retryAfterSeconds),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": result.resetAt,
  };
}
