const GB = 1024 ** 3;

export type StorageHealthV103 =
  | "normal"
  | "attention"
  | "warning"
  | "critical"
  | "unknown";

export function storageHealthV103(
  diskFreeBytes: number | null | undefined,
  videoBudgetBytes: number | null | undefined,
) {
  const free = Number(
    diskFreeBytes,
  );
  const budget = Number(
    videoBudgetBytes,
  );

  if (!Number.isFinite(free)) {
    return {
      level: "unknown" as StorageHealthV103,
      videosAtRisk: false,
      videoCaptureSuspended: false,
      recommendedFreeBytes: 10 * GB,
    };
  }

  const level: StorageHealthV103 =
    free < 4 * GB
      ? "critical"
      : free < 6 * GB
        ? "warning"
        : free < 10 * GB
          ? "attention"
          : "normal";

  return {
    level,
    videosAtRisk:
      free < 6 * GB ||
      (Number.isFinite(budget) &&
        budget <= 0),
    videoCaptureSuspended:
      free < 4 * GB ||
      (Number.isFinite(budget) &&
        budget <= 0),
    recommendedFreeBytes: 10 * GB,
  };
}
