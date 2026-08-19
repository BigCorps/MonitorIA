import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import {
  hasRequiredOnboardingIntake,
  type OnboardingIntake,
} from "@/src/lib/onboarding-intake";

const COOKIE_NAME =
  "monitoria_guided_onboarding";
const MAX_AGE_SECONDS = 60 * 60 * 2;

type SignedPayload = {
  version: 1;
  expiresAt: number;
  intake: OnboardingIntake;
};

function signingSecret() {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada.",
    );
  }

  return secret;
}

function sign(payload: string) {
  return createHmac(
    "sha256",
    signingSecret(),
  )
    .update(payload)
    .digest("base64url");
}

function encodePayload(
  payload: SignedPayload,
) {
  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
}

function safeSignatureEqual(
  received: string,
  expected: string,
) {
  const left = Buffer.from(
    received,
    "utf8",
  );
  const right = Buffer.from(
    expected,
    "utf8",
  );

  return (
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function savePendingOnboarding(
  intake: OnboardingIntake,
) {
  if (
    !hasRequiredOnboardingIntake(intake)
  ) {
    throw new Error(
      "Dados iniciais do onboarding incompletos.",
    );
  }

  const payload = encodePayload({
    version: 1,
    expiresAt:
      Date.now() +
      MAX_AGE_SECONDS * 1000,
    intake,
  });
  const value = `${payload}.${sign(payload)}`;
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function readPendingOnboarding(): Promise<
  OnboardingIntake | null
> {
  const cookieStore = await cookies();
  const raw =
    cookieStore.get(COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  const separator =
    raw.lastIndexOf(".");

  if (separator <= 0) {
    return null;
  }

  const payload = raw.slice(
    0,
    separator,
  );
  const receivedSignature =
    raw.slice(separator + 1);
  const expectedSignature =
    sign(payload);

  if (
    !safeSignatureEqual(
      receivedSignature,
      expectedSignature,
    )
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(
        payload,
        "base64url",
      ).toString("utf8"),
    ) as SignedPayload;

    if (
      decoded.version !== 1 ||
      decoded.expiresAt < Date.now() ||
      !hasRequiredOnboardingIntake(
        decoded.intake,
      )
    ) {
      return null;
    }

    return decoded.intake;
  } catch {
    return null;
  }
}

export async function clearPendingOnboarding() {
  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
