import type { MonitoringSchedule } from "./types.js";

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    day: weekdayMap[value("weekday")] ?? date.getUTCDay(),
    minutes:
      Number(value("hour") || "0") * 60 +
      Number(value("minute") || "0"),
  };
}

function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

export function monitoringScheduleState(
  schedule: MonitoringSchedule | null | undefined,
  timeZone: string,
  date = new Date(),
) {
  if (!schedule || schedule.mode !== "weekly") {
    return {
      enabled: true,
      thresholdMultiplier: 1,
      period: "always" as const,
    };
  }

  const local = localParts(date, timeZone);
  const intervals = Array.isArray(schedule.weekly)
    ? schedule.weekly
    : [];

  const inside = intervals.some((interval) => {
    if (Number(interval.day) !== local.day) return false;

    const start = parseTime(interval.start);
    const end = parseTime(interval.end);
    if (start === null || end === null) return false;

    if (start === end) return true;
    if (start < end) {
      return local.minutes >= start && local.minutes < end;
    }

    return local.minutes >= start || local.minutes < end;
  });

  if (inside) {
    return {
      enabled: true,
      thresholdMultiplier: 1,
      period: "scheduled" as const,
    };
  }

  if (schedule.outsideMode === "significant_only") {
    return {
      enabled: true,
      thresholdMultiplier: 1.8,
      period: "outside_significant" as const,
    };
  }

  return {
    enabled: false,
    thresholdMultiplier: 1,
    period: "outside_off" as const,
  };
}
