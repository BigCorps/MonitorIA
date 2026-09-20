"use client";

import type { RecordingPoint } from "./types";

export const RECORDING_MOTION_WIDTH = 160;
export const RECORDING_MOTION_HEIGHT = 90;

const GRID_COLUMNS = 16;
const GRID_ROWS = 9;
const CELL_WIDTH = RECORDING_MOTION_WIDTH / GRID_COLUMNS;
const CELL_HEIGHT = RECORDING_MOTION_HEIGHT / GRID_ROWS;

export type MotionCalculation = {
  changedPixelPercent: number;
  meanAbsoluteDifference: number;
  analyzedPixels: number;
  changedPixels: number;
  motionCentroidX: number | null;
  motionCentroidY: number | null;
  dominantRegion: string | null;
  activeRegionCount: number;
  motionSpreadPercent: number;
  motionDensityPercent: number;
  meanLuma: number;
  meanLumaDelta: number;
  directionalChangeRatio: number;
};

export type MotionQualityInput = Pick<
  MotionCalculation,
  | "changedPixelPercent"
  | "meanAbsoluteDifference"
  | "activeRegionCount"
  | "motionSpreadPercent"
  | "motionDensityPercent"
  | "meanLuma"
  | "meanLumaDelta"
  | "directionalChangeRatio"
>;

export function isLikelyCameraNoise(sample: MotionQualityInput) {
  const globalIlluminationChange =
    sample.activeRegionCount >= 8 &&
    sample.motionSpreadPercent >= 92 &&
    sample.motionDensityPercent >= 65 &&
    sample.directionalChangeRatio >= 0.82 &&
    Math.abs(sample.meanLumaDelta) >= 2.5;

  const diffuseLowLightNoise =
    sample.meanLuma <= 52 &&
    sample.activeRegionCount >= 3 &&
    sample.motionSpreadPercent >= 80 &&
    sample.motionDensityPercent <= 8;

  const sparseWholeFrameNoise =
    sample.activeRegionCount >= 3 &&
    sample.motionSpreadPercent >= 88 &&
    sample.motionDensityPercent <= 3.5 &&
    sample.meanAbsoluteDifference <= 8;

  return (
    sample.changedPixelPercent > 0 &&
    (globalIlluminationChange ||
      diffuseLowLightNoise ||
      sparseWholeFrameNoise)
  );
}

function pointInPolygon(
  x: number,
  y: number,
  polygon: RecordingPoint[],
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
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;

    if (intersects) inside = !inside;
  }

  return inside;
}

function overlayPolygon(
  overlay:
    | "auto"
    | "none"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right",
): RecordingPoint[] | null {
  const width = 0.38;
  const height = 0.16;

  if (overlay === "top-left") {
    return [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
  }
  if (overlay === "top-right") {
    return [
      { x: 1 - width, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: height },
      { x: 1 - width, y: height },
    ];
  }
  if (overlay === "bottom-left") {
    return [
      { x: 0, y: 1 - height },
      { x: width, y: 1 - height },
      { x: width, y: 1 },
      { x: 0, y: 1 },
    ];
  }
  if (overlay === "bottom-right") {
    return [
      { x: 1 - width, y: 1 - height },
      { x: 1, y: 1 - height },
      { x: 1, y: 1 },
      { x: 1 - width, y: 1 },
    ];
  }
  return null;
}

export function buildRecordingMotionMask(
  polygons: RecordingPoint[][],
  overlay:
    | "auto"
    | "none"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right",
) {
  const mask = new Uint8Array(
    RECORDING_MOTION_WIDTH * RECORDING_MOTION_HEIGHT,
  );
  const allPolygons = [...polygons];
  const fixedOverlay = overlayPolygon(overlay);
  if (fixedOverlay) allPolygons.push(fixedOverlay);

  for (let y = 0; y < RECORDING_MOTION_HEIGHT; y += 1) {
    for (let x = 0; x < RECORDING_MOTION_WIDTH; x += 1) {
      const normalizedX = (x + 0.5) / RECORDING_MOTION_WIDTH;
      const normalizedY = (y + 0.5) / RECORDING_MOTION_HEIGHT;

      if (
        allPolygons.some(
          (polygon) =>
            polygon.length >= 3 &&
            pointInPolygon(normalizedX, normalizedY, polygon),
        )
      ) {
        mask[y * RECORDING_MOTION_WIDTH + x] = 1;
      }
    }
  }

  return mask;
}

export function calculateRecordingMotion(
  previous: Uint8Array,
  current: Uint8Array,
  pixelDifferenceThreshold = 20,
  ignoredPixels?: Uint8Array,
): MotionCalculation {
  if (previous.length !== current.length || current.length === 0) {
    throw new Error("Os quadros de movimento precisam ter o mesmo tamanho.");
  }

  let changedPixels = 0;
  let analyzedPixels = 0;
  let absoluteDifferenceTotal = 0;
  let previousLumaTotal = 0;
  let currentLumaTotal = 0;
  let positiveChangedPixels = 0;
  let negativeChangedPixels = 0;
  let changedXTotal = 0;
  let changedYTotal = 0;
  let minChangedX = RECORDING_MOTION_WIDTH;
  let maxChangedX = -1;
  let minChangedY = RECORDING_MOTION_HEIGHT;
  let maxChangedY = -1;
  const activeRegions = new Set<string>();

  for (let index = 0; index < current.length; index += 1) {
    if (ignoredPixels?.[index]) continue;

    const previousLuma = Number(previous[index]);
    const currentLuma = Number(current[index]);
    const signedDifference = currentLuma - previousLuma;
    const difference = Math.abs(signedDifference);

    analyzedPixels += 1;
    absoluteDifferenceTotal += difference;
    previousLumaTotal += previousLuma;
    currentLumaTotal += currentLuma;

    if (difference >= pixelDifferenceThreshold) {
      changedPixels += 1;
      if (signedDifference > 0) positiveChangedPixels += 1;
      else if (signedDifference < 0) negativeChangedPixels += 1;

      const changedX = index % RECORDING_MOTION_WIDTH;
      const changedY = Math.floor(index / RECORDING_MOTION_WIDTH);
      changedXTotal += changedX;
      changedYTotal += changedY;
      minChangedX = Math.min(minChangedX, changedX);
      maxChangedX = Math.max(maxChangedX, changedX);
      minChangedY = Math.min(minChangedY, changedY);
      maxChangedY = Math.max(maxChangedY, changedY);

      activeRegions.add(
        `${Math.min(
          2,
          Math.floor((changedX / RECORDING_MOTION_WIDTH) * 3),
        )}:${Math.min(
          2,
          Math.floor((changedY / RECORDING_MOTION_HEIGHT) * 3),
        )}`,
      );
    }
  }

  if (!analyzedPixels) {
    return {
      changedPixelPercent: 0,
      meanAbsoluteDifference: 0,
      analyzedPixels: 0,
      changedPixels: 0,
      motionCentroidX: null,
      motionCentroidY: null,
      dominantRegion: null,
      activeRegionCount: 0,
      motionSpreadPercent: 0,
      motionDensityPercent: 0,
      meanLuma: 0,
      meanLumaDelta: 0,
      directionalChangeRatio: 0,
    };
  }

  const motionCentroidX = changedPixels
    ? Number(
        (
          changedXTotal /
          changedPixels /
          Math.max(1, RECORDING_MOTION_WIDTH - 1)
        ).toFixed(4),
      )
    : null;
  const motionCentroidY = changedPixels
    ? Number(
        (
          changedYTotal /
          changedPixels /
          Math.max(1, RECORDING_MOTION_HEIGHT - 1)
        ).toFixed(4),
      )
    : null;

  const dominantRegion =
    motionCentroidX === null || motionCentroidY === null
      ? null
      : `${Math.min(2, Math.floor(motionCentroidX * 3))}:${Math.min(
          2,
          Math.floor(motionCentroidY * 3),
        )}`;

  const motionSpreadPercent = changedPixels
    ? Number(
        (
          (((maxChangedX - minChangedX + 1) *
            (maxChangedY - minChangedY + 1)) /
            (RECORDING_MOTION_WIDTH * RECORDING_MOTION_HEIGHT)) *
          100
        ).toFixed(4),
      )
    : 0;

  const changedArea = changedPixels
    ? (maxChangedX - minChangedX + 1) *
      (maxChangedY - minChangedY + 1)
    : 0;

  const motionDensityPercent = changedArea
    ? Number(((changedPixels / changedArea) * 100).toFixed(4))
    : 0;

  const meanLuma = currentLumaTotal / analyzedPixels;
  const previousMeanLuma = previousLumaTotal / analyzedPixels;
  const directionalChangeRatio = changedPixels
    ? Math.max(positiveChangedPixels, negativeChangedPixels) /
      changedPixels
    : 0;

  return {
    changedPixelPercent: Number(
      ((changedPixels / analyzedPixels) * 100).toFixed(4),
    ),
    meanAbsoluteDifference: Number(
      (absoluteDifferenceTotal / analyzedPixels).toFixed(4),
    ),
    analyzedPixels,
    changedPixels,
    motionCentroidX,
    motionCentroidY,
    dominantRegion,
    activeRegionCount: activeRegions.size,
    motionSpreadPercent,
    motionDensityPercent,
    meanLuma: Number(meanLuma.toFixed(4)),
    meanLumaDelta: Number(
      (meanLuma - previousMeanLuma).toFixed(4),
    ),
    directionalChangeRatio: Number(
      directionalChangeRatio.toFixed(4),
    ),
  };
}

function cellFor(index: number) {
  const y = Math.floor(index / RECORDING_MOTION_WIDTH);
  const x = index % RECORDING_MOTION_WIDTH;
  return (
    Math.min(GRID_ROWS - 1, Math.floor(y / CELL_HEIGHT)) * GRID_COLUMNS +
    Math.min(GRID_COLUMNS - 1, Math.floor(x / CELL_WIDTH))
  );
}

function borderCell(cell: number) {
  const row = Math.floor(cell / GRID_COLUMNS);
  const col = cell % GRID_COLUMNS;
  return (
    row <= 1 ||
    row === GRID_ROWS - 1 ||
    col === 0 ||
    col === GRID_COLUMNS - 1
  );
}

export class RecordingBorderNoiseSuppressor {
  private samples = 0;
  private active = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
  private sums = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
  private ignored = new Set<number>();

  observe(
    previous: Uint8Array,
    current: Uint8Array,
    staticMask: Uint8Array,
  ) {
    this.samples += 1;
    const changed = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
    const totals = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);

    for (let index = 0; index < current.length; index += 1) {
      if (staticMask[index]) continue;
      const cell = cellFor(index);
      totals[cell] += 1;
      if (
        Math.abs(Number(current[index]) - Number(previous[index])) >=
        20
      ) {
        changed[cell] += 1;
      }
    }

    for (let cell = 0; cell < changed.length; cell += 1) {
      if (!borderCell(cell) || !totals[cell]) continue;
      const percent = (changed[cell] / totals[cell]) * 100;
      this.sums[cell] += percent;
      if (percent >= 1) this.active[cell] += 1;
    }

    if (this.samples >= 45 && this.samples % 15 === 0) {
      this.ignored = new Set(
        this.active
          .map((count, cell) => ({
            cell,
            ratio: count / this.samples,
            mean: this.sums[cell] / this.samples,
          }))
          .filter(
            (item) =>
              borderCell(item.cell) &&
              item.ratio >= 0.78 &&
              item.mean >= 1,
          )
          .sort(
            (left, right) =>
              right.ratio * right.mean - left.ratio * left.mean,
          )
          .slice(0, 10)
          .map((item) => item.cell),
      );
    }
  }

  apply(staticMask: Uint8Array) {
    if (!this.ignored.size) return staticMask;
    const result = Uint8Array.from(staticMask);
    for (let index = 0; index < result.length; index += 1) {
      if (this.ignored.has(cellFor(index))) result[index] = 1;
    }
    return result;
  }

  count() {
    return this.ignored.size;
  }
}
