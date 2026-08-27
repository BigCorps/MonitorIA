import type { LocalMotionEvent, NormalizedPoint } from "../types.js";
import { requestAgentJsonV102 } from "../v102/api.js";

export type OperationalAccessConfigV103 = {
  enabled: boolean;
  openingTime: string | null;
  closingTime: string | null;
  timezone: string;
  polygon: NormalizedPoint[] | null;
  markerName: string | null;
  markerMinConfidence: number | null;
};

type OperationalConfigResponseV103 = {
  ok: true;
  configVersion: 1;
  cameras: Array<{
    cameraId: string;
    operationalAccess: OperationalAccessConfigV103;
  }>;
};

function parseMinute(value: string | null | undefined) {
  if (!value) return null;
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

function localMinute(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return Number(value("hour")) * 60 + Number(value("minute"));
}

function circularMinuteDistance(left: number, right: number) {
  const direct = Math.abs(left - right);
  return Math.min(direct, 1440 - direct);
}

export function operationalMomentContext(
  config: OperationalAccessConfigV103 | null | undefined,
  date: Date,
  fallbackTimezone: string,
) {
  if (!config?.enabled) {
    return {
      enabled: false,
      outsideDeclaredHours: false,
      operationalPeriod: "not_configured" as const,
      nearOperationalTransitionWindow: false,
    };
  }

  const timezone = config.timezone || fallbackTimezone;
  const opening = parseMinute(config.openingTime);
  const closing = parseMinute(config.closingTime);
  const current = localMinute(date, timezone);

  if (opening === null || closing === null || opening === closing) {
    return {
      enabled: true,
      outsideDeclaredHours: false,
      operationalPeriod: "configured_without_valid_hours" as const,
      nearOperationalTransitionWindow: false,
    };
  }

  const inside =
    opening < closing
      ? current >= opening && current < closing
      : current >= opening || current < closing;

  const nearTransition =
    circularMinuteDistance(current, opening) <= 120 ||
    circularMinuteDistance(current, closing) <= 120;

  return {
    enabled: true,
    outsideDeclaredHours: !inside,
    operationalPeriod: inside
      ? ("business_hours" as const)
      : ("outside_hours" as const),
    nearOperationalTransitionWindow: nearTransition,
  };
}

export async function fetchOperationalConfigV103(
  apiBaseUrl: string,
  token: string,
) {
  const response = await requestAgentJsonV102<OperationalConfigResponseV103>(
    apiBaseUrl,
    token,
    "/api/agent/v103/operational-config",
    { method: "GET" },
  );

  const map = new Map<string, OperationalAccessConfigV103>();
  for (const entry of response.cameras ?? []) {
    if (!entry?.cameraId || !entry.operationalAccess) continue;
    map.set(String(entry.cameraId), entry.operationalAccess);
  }
  return map;
}

export function enrichOperationalEventV103(
  event: LocalMotionEvent,
  config: OperationalAccessConfigV103 | null | undefined,
  timezone: string,
): LocalMotionEvent {
  if (!config?.enabled) return event;

  const context = operationalMomentContext(
    config,
    new Date(event.endedAt),
    timezone,
  );

  return {
    ...event,
    localMetrics: {
      ...event.localMetrics,
      operationalAccessEnabled: true,
      outsideDeclaredHours: context.outsideDeclaredHours,
      operationalPeriod: context.operationalPeriod,
      nearOperationalTransitionWindow:
        context.nearOperationalTransitionWindow,
      operationalMarkerName: config.markerName,
      operationalPriorityHint: context.outsideDeclaredHours
        ? "high_outside_hours"
        : "operational",
    } as LocalMotionEvent["localMetrics"],
  };
}
