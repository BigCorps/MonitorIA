export type RetentionPlanCode = "basic" | "standard" | "intensive";
export type RetentionFrameLabel = "start" | "peak" | "end" | "extra";

export type RetentionPolicy = {
  planCode: RetentionPlanCode;
  metadataRetentionDays: number;
  longTermKeyframes: number;
  temporaryFrameDays: number;
  clipEnabled: boolean;
  clipRetentionDays: number | null;
};

export const RETENTION_POLICIES: Record<RetentionPlanCode, RetentionPolicy> = {
  basic: {
    planCode: "basic",
    metadataRetentionDays: 365,
    longTermKeyframes: 1,
    temporaryFrameDays: 1,
    clipEnabled: false,
    clipRetentionDays: null,
  },
  standard: {
    planCode: "standard",
    metadataRetentionDays: 365,
    longTermKeyframes: 2,
    temporaryFrameDays: 3,
    clipEnabled: false,
    clipRetentionDays: null,
  },
  intensive: {
    planCode: "intensive",
    metadataRetentionDays: 365,
    longTermKeyframes: 3,
    temporaryFrameDays: 7,
    clipEnabled: true,
    clipRetentionDays: 30,
  },
};

const PRIORITIES: Record<RetentionPlanCode, RetentionFrameLabel[]> = {
  basic: ["peak", "start", "end", "extra"],
  standard: ["start", "peak", "end", "extra"],
  intensive: ["start", "peak", "end", "extra"],
};

export function framePriority(
  planCode: RetentionPlanCode,
  label: RetentionFrameLabel,
) {
  const index = PRIORITIES[planCode].indexOf(label);
  return index === -1 ? 99 : index + 1;
}

export function selectLongTermFrameLabels(
  planCode: RetentionPlanCode,
  labels: RetentionFrameLabel[],
): RetentionFrameLabel[] {
  const unique = [...new Set(labels)];
  const maximum = RETENTION_POLICIES[planCode].longTermKeyframes;

  return unique
    .sort((left, right) => {
      const priorityDifference =
        framePriority(planCode, left) - framePriority(planCode, right);
      return priorityDifference || left.localeCompare(right);
    })
    .slice(0, maximum);
}

export function retentionExpiresAt(
  baseDate: Date,
  retentionDays: number,
) {
  if (!Number.isFinite(retentionDays) || retentionDays < 1) {
    throw new Error("invalid_retention_days");
  }

  return new Date(baseDate.getTime() + Math.floor(retentionDays) * 86_400_000);
}
