import { createHmac, randomBytes } from "node:crypto";

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function agentSecret() {
  const value = process.env.MONITORIA_AGENT_SECRET;

  if (!value || value.length < 32) {
    throw new Error("MONITORIA_AGENT_SECRET deve ter pelo menos 32 caracteres.");
  }

  return value;
}

function hmac(value: string) {
  return createHmac("sha256", agentSecret()).update(value).digest("hex");
}

export function normalizePairingCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function generatePairingCode() {
  const bytes = randomBytes(12);
  let body = "";

  for (const byte of bytes) {
    body += PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length];
  }

  return `MTR-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function hashPairingCode(code: string) {
  return hmac(`pairing:${normalizePairingCode(code)}`);
}

export function generateAgentToken() {
  return `mta_${randomBytes(32).toString("base64url")}`;
}

export function hashAgentToken(token: string) {
  return hmac(`agent:${token.trim()}`);
}
