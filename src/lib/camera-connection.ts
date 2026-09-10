export const CAMERA_SIGNAL_STALE_MS = 15 * 60 * 1000;

export function cameraHasRecentSignal(
  status: string,
  lastSeenAt: string | null,
  nowMs = Date.now(),
) {
  if (status !== "online" || !lastSeenAt) return false;

  const seenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(seenMs)) return false;

  return nowMs - seenMs <= CAMERA_SIGNAL_STALE_MS;
}
