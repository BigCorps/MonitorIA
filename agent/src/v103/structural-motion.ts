import {
  calculateMotion,
  isLikelyCameraNoise,
  MOTION_HEIGHT,
  MOTION_WIDTH,
  type MotionCalculation,
} from "../motion.js";
import type { NormalizedPoint } from "../types.js";

function pointInPolygon(
  x: number,
  y: number,
  polygon: NormalizedPoint[],
) {
  let inside = false;

  for (
    let current = 0, previous = polygon.length - 1;
    current < polygon.length;
    previous = current, current += 1
  ) {
    const currentPoint = polygon[current];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;

    const intersects =
      currentPoint.y > y !== previousPoint.y > y &&
      x <
        ((previousPoint.x - currentPoint.x) *
          (y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y ||
            Number.EPSILON) +
          currentPoint.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

export function buildOperationalFocusMask(
  polygon: NormalizedPoint[] | null | undefined,
  existingIgnoredPixels?: Uint8Array,
) {
  const mask = existingIgnoredPixels
    ? Uint8Array.from(existingIgnoredPixels)
    : new Uint8Array(MOTION_WIDTH * MOTION_HEIGHT);

  if (!polygon || polygon.length < 3) return mask;

  for (let y = 0; y < MOTION_HEIGHT; y += 1) {
    for (let x = 0; x < MOTION_WIDTH; x += 1) {
      const index = y * MOTION_WIDTH + x;
      if (mask[index]) continue;

      const normalizedX = (x + 0.5) / MOTION_WIDTH;
      const normalizedY = (y + 0.5) / MOTION_HEIGHT;

      if (!pointInPolygon(normalizedX, normalizedY, polygon)) {
        mask[index] = 1;
      }
    }
  }

  return mask;
}

export function structuralStartThreshold(input: {
  configuredStartThreshold: number;
  hasFocusPolygon: boolean;
  outsideDeclaredHours: boolean;
}) {
  const floor = input.hasFocusPolygon ? 1.5 : 3;
  const factor = input.hasFocusPolygon ? 3 : 5;
  const base = Math.max(
    floor,
    input.configuredStartThreshold * factor,
  );

  return Number(
    (
      input.outsideDeclaredHours
        ? Math.max(floor * 0.8, base * 0.85)
        : base
    ).toFixed(4),
  );
}

export function structuralContinueThreshold(startThreshold: number) {
  return Number(Math.max(0.3, startThreshold * 0.25).toFixed(4));
}

export function evaluateStructuralTrigger(input: {
  longWindow: MotionCalculation;
  shortWindow: MotionCalculation;
  configuredStartThreshold: number;
  hasFocusPolygon: boolean;
  outsideDeclaredHours: boolean;
  nearOperationalTransitionWindow: boolean;
}) {
  const startThreshold = structuralStartThreshold({
    configuredStartThreshold: input.configuredStartThreshold,
    hasFocusPolygon: input.hasFocusPolygon,
    outsideDeclaredHours: input.outsideDeclaredHours,
  });

  const likelyIlluminationShift = isLikelyCameraNoise(input.longWindow);

  if (
    likelyIlluminationShift &&
    !input.nearOperationalTransitionWindow
  ) {
    return {
      trigger: false,
      reason: "illumination_shift_outside_attention_window" as const,
      startThreshold,
      likelyIlluminationShift,
    };
  }

  // Se o detector normal já tem movimento suficiente, deixamos que ele
  // forme o acontecimento. O observador estrutural existe para cobrir a
  // lacuna de mudanças lentas acumuladas, não para duplicar eventos.
  if (
    input.shortWindow.changedPixelPercent >=
    input.configuredStartThreshold
  ) {
    return {
      trigger: false,
      reason: "regular_motion_detector_should_handle" as const,
      startThreshold,
      likelyIlluminationShift,
    };
  }

  return {
    trigger:
      input.longWindow.changedPixelPercent >= startThreshold,
    reason:
      input.longWindow.changedPixelPercent >= startThreshold
        ? ("slow_structural_change" as const)
        : ("below_structural_threshold" as const),
    startThreshold,
    likelyIlluminationShift,
  };
}

export function calculateStructuralMotion(
  reference: Uint8Array,
  current: Uint8Array,
  mask: Uint8Array,
) {
  return calculateMotion(reference, current, 20, mask);
}
