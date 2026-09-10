export const releaseManifest = {
  code: "phase12-production",
  version: "1.0.3",
  automatedTestsApproved: true,
  additionalAlertModelCalls: 0,
} as const;

/**
 * O MonitorIA 1.0.3 é a versão final atualmente publicada.
 * O bloqueio de "liberação gradual" foi removido do produto.
 */
export function generalSignupEnabled() {
  return true;
}

export function deployedCommitSha() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    null
  );
}
