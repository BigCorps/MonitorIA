export const releaseManifest = {
  code: "phase12-production",
  version: "1.0.0",
  automatedTestsApproved: true,
  additionalAlertModelCalls: 0,
} as const;

export function generalSignupEnabled() {
  return process.env.GENERAL_SIGNUP_ENABLED?.trim().toLowerCase() === "true";
}

export function deployedCommitSha() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    null
  );
}
