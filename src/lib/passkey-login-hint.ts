export const PASSKEY_LOGIN_HINT_COOKIE =
  "monitoria_passkey_ready";

export const PASSKEY_LOGIN_HINT_MAX_AGE =
  60 * 60 * 24 * 365;

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function passkeyLoginReady(
  value: unknown,
): boolean {
  const settings = objectValue(value);

  return (
    settings.allow_passkey === true &&
    positiveInteger(settings.passkey_count)
  );
}
