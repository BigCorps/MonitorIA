import { createHash, randomBytes } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

export function normalizeSalesTrialToken(value: unknown) {
  const token = typeof value === "string" ? value.trim() : "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function hashSalesTrialToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSalesTrialToken() {
  return randomBytes(32).toString("base64url");
}
