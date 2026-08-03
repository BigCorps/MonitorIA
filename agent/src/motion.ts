import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { sanitizeFfmpegError } from "./ffmpeg.js";
import type { NormalizedPoint } from "./types.js";

export const MOTION_WIDTH = 160;
export const MOTION_HEIGHT = 90;
const MOTION_FRAME_BYTES = MOTION_WIDTH * MOTION_HEIGHT;
const GRID_COLUMNS = 16;
const GRID_ROWS = 9;
const CELL_WIDTH = MOTION_WIDTH / GRID_COLUMNS;
const CELL_HEIGHT = MOTION_HEIGHT / GRID_ROWS;

export type MotionSample = {
  capturedAt: string;
  changedPixelPercent: number;
  rawChangedPixelPercent: number;
  meanAbsoluteDifference: number;
  ignoredPixelPercent: number;
  autoIgnoredCellCount: number;
  motionCentroidX: number | null;
  motionCentroidY: number | null;
  dominantRegion: string | null;
  activeRegionCount: number;
  motionSpreadPercent: number;
};

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
};

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
): NormalizedPoint[] | null {
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

export function buildMotionMask(
  polygons: NormalizedPoint[][],
  overlay:
    | "auto"
    | "none"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right",
) {
  const mask = new Uint8Array(MOTION_FRAME_BYTES);
  const allPolygons = [...polygons];
  const fixedOverlay = overlayPolygon(overlay);
  if (fixedOverlay) allPolygons.push(fixedOverlay);

  for (let y = 0; y < MOTION_HEIGHT; y += 1) {
    for (let x = 0; x < MOTION_WIDTH; x += 1) {
      const normalizedX = (x + 0.5) / MOTION_WIDTH;
      const normalizedY = (y + 0.5) / MOTION_HEIGHT;

      if (
        allPolygons.some(
          (polygon) =>
            polygon.length >= 3 &&
            pointInPolygon(normalizedX, normalizedY, polygon),
        )
      ) {
        mask[y * MOTION_WIDTH + x] = 1;
      }
    }
  }

  return mask;
}

export function calculateMotion(
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
  let changedXTotal = 0;
  let changedYTotal = 0;
  let minChangedX = MOTION_WIDTH;
  let maxChangedX = -1;
  let minChangedY = MOTION_HEIGHT;
  let maxChangedY = -1;
  const activeRegions = new Set<string>();

  for (let index = 0; index < current.length; index += 1) {
    if (ignoredPixels?.[index]) continue;

    const difference = Math.abs(
      Number(current[index]) - Number(previous[index]),
    );

    analyzedPixels += 1;
    absoluteDifferenceTotal += difference;

    if (difference >= pixelDifferenceThreshold) {
      changedPixels += 1;
      const changedX = index % MOTION_WIDTH;
      const changedY = Math.floor(index / MOTION_WIDTH);
      changedXTotal += changedX;
      changedYTotal += changedY;
      minChangedX = Math.min(minChangedX, changedX);
      maxChangedX = Math.max(maxChangedX, changedX);
      minChangedY = Math.min(minChangedY, changedY);
      maxChangedY = Math.max(maxChangedY, changedY);
      activeRegions.add(
        String(Math.min(2, Math.floor((changedX / MOTION_WIDTH) * 3))) +
          ":" +
          String(
            Math.min(
              2,
              Math.floor((changedY / MOTION_HEIGHT) * 3),
            ),
          ),
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
    };
  }

  const motionCentroidX = changedPixels
    ? Number(
        (
          changedXTotal /
          changedPixels /
          Math.max(1, MOTION_WIDTH - 1)
        ).toFixed(4),
      )
    : null;

  const motionCentroidY = changedPixels
    ? Number(
        (
          changedYTotal /
          changedPixels /
          Math.max(1, MOTION_HEIGHT - 1)
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
            (MOTION_WIDTH * MOTION_HEIGHT)) *
          100
        ).toFixed(4),
      )
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
  };
}

function cellIndexForPixel(index: number) {
  const y = Math.floor(index / MOTION_WIDTH);
  const x = index % MOTION_WIDTH;
  const column = Math.min(
    GRID_COLUMNS - 1,
    Math.floor(x / CELL_WIDTH),
  );
  const row = Math.min(
    GRID_ROWS - 1,
    Math.floor(y / CELL_HEIGHT),
  );
  return row * GRID_COLUMNS + column;
}

function isBorderCell(index: number) {
  const row = Math.floor(index / GRID_COLUMNS);
  const column = index % GRID_COLUMNS;

  return (
    row <= 1 ||
    row === GRID_ROWS - 1 ||
    column === 0 ||
    column === GRID_COLUMNS - 1
  );
}

class BorderNoiseSuppressor {
  private samples = 0;
  private readonly activeCounts = new Array(
    GRID_COLUMNS * GRID_ROWS,
  ).fill(0);
  private readonly activitySums = new Array(
    GRID_COLUMNS * GRID_ROWS,
  ).fill(0);
  private autoIgnoredCells = new Set<number>();

  observe(
    previous: Uint8Array,
    current: Uint8Array,
    staticMask: Uint8Array,
    pixelDifferenceThreshold: number,
  ) {
    this.samples += 1;

    const changed = new Array(
      GRID_COLUMNS * GRID_ROWS,
    ).fill(0);
    const totals = new Array(
      GRID_COLUMNS * GRID_ROWS,
    ).fill(0);

    for (let index = 0; index < current.length; index += 1) {
      if (staticMask[index]) continue;

      const cell = cellIndexForPixel(index);
      totals[cell] += 1;

      if (
        Math.abs(
          Number(current[index]) - Number(previous[index]),
        ) >= pixelDifferenceThreshold
      ) {
        changed[cell] += 1;
      }
    }

    for (let cell = 0; cell < changed.length; cell += 1) {
      if (!isBorderCell(cell) || !totals[cell]) continue;

      const percent = (changed[cell] / totals[cell]) * 100;
      this.activitySums[cell] =
        (this.activitySums[cell] ?? 0) + percent;

      if (percent >= 1) {
        this.activeCounts[cell] =
          (this.activeCounts[cell] ?? 0) + 1;
      }
    }

    if (this.samples >= 30 && this.samples % 15 === 0) {
      const candidates = this.activeCounts
        .map((count, cell) => ({
          cell,
          ratio: count / this.samples,
          mean: (this.activitySums[cell] ?? 0) / this.samples,
        }))
        .filter(
          (candidate) =>
            isBorderCell(candidate.cell) &&
            candidate.ratio >= 0.7 &&
            candidate.mean >= 1,
        )
        .sort(
          (left, right) =>
            right.ratio * right.mean -
            left.ratio * left.mean,
        )
        .slice(0, 12);

      this.autoIgnoredCells = new Set(
        candidates.map((candidate) => candidate.cell),
      );
    }
  }

  apply(mask: Uint8Array) {
    if (!this.autoIgnoredCells.size) return mask;

    const combined = Uint8Array.from(mask);

    for (let index = 0; index < combined.length; index += 1) {
      if (this.autoIgnoredCells.has(cellIndexForPixel(index))) {
        combined[index] = 1;
      }
    }

    return combined;
  }

  count() {
    return this.autoIgnoredCells.size;
  }
}

export type MotionSampler = {
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

export function startMotionSampler(options: {
  ffmpegPath: string;
  rtspUrl: string;
  captureIntervalSeconds: number;
  ignorePolygons?: NormalizedPoint[][];
  overlayMask?:
    | "auto"
    | "none"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right";
  onSample: (sample: MotionSample) => void;
  onError: (error: Error) => void;
}): MotionSampler {
  const interval = Math.max(
    0.2,
    Math.min(60, Number(options.captureIntervalSeconds || 1)),
  );

  const overlay = options.overlayMask ?? "auto";
  const staticMask = buildMotionMask(
    options.ignorePolygons ?? [],
    overlay,
  );
  const borderNoise = new BorderNoiseSuppressor();

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    options.rtspUrl,
    "-map",
    "0:v:0",
    "-an",
    "-vf",
    [
      `fps=1/${interval}`,
      `scale=${MOTION_WIDTH}:${MOTION_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${MOTION_WIDTH}:${MOTION_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      "format=gray",
    ].join(","),
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "pipe:1",
  ];

  const child: ChildProcessWithoutNullStreams = spawn(
    options.ffmpegPath,
    args,
    {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  );

  let pending = Buffer.alloc(0);
  let previous: Buffer | null = null;
  let stderr = "";
  let running = true;
  let intentionalStop = false;

  child.stdout.on("data", (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk]);

    while (pending.length >= MOTION_FRAME_BYTES) {
      const frame = Buffer.from(
        pending.subarray(0, MOTION_FRAME_BYTES),
      );
      pending = pending.subarray(MOTION_FRAME_BYTES);

      if (previous) {
        try {
          if (overlay === "auto") {
            borderNoise.observe(
              previous,
              frame,
              staticMask,
              20,
            );
          }

          const raw = calculateMotion(
            previous,
            frame,
            20,
            staticMask,
          );

          const combinedMask =
            overlay === "auto"
              ? borderNoise.apply(staticMask)
              : staticMask;

          const effective = calculateMotion(
            previous,
            frame,
            20,
            combinedMask,
          );

          const ignoredPixels = combinedMask.reduce(
            (total, value) => total + (value ? 1 : 0),
            0,
          );

          options.onSample({
            capturedAt: new Date().toISOString(),
            changedPixelPercent: effective.changedPixelPercent,
            rawChangedPixelPercent: raw.changedPixelPercent,
            meanAbsoluteDifference:
              effective.meanAbsoluteDifference,
            ignoredPixelPercent: Number(
              (
                (ignoredPixels / combinedMask.length) *
                100
              ).toFixed(4),
            ),
            autoIgnoredCellCount: borderNoise.count(),
            motionCentroidX: effective.motionCentroidX,
            motionCentroidY: effective.motionCentroidY,
            dominantRegion: effective.dominantRegion,
            activeRegionCount: effective.activeRegionCount,
            motionSpreadPercent: effective.motionSpreadPercent,
          });
        } catch (error) {
          options.onError(
            error instanceof Error
              ? error
              : new Error(String(error)),
          );
        }
      }

      previous = frame;
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-4000);
  });

  child.on("error", (error: Error) => {
    running = false;
    if (!intentionalStop) options.onError(error);
  });

  child.on("close", (code: number | null) => {
    running = false;

    if (!intentionalStop) {
      options.onError(
        new Error(
          sanitizeFfmpegError(stderr) ||
            `O monitor FFmpeg encerrou com o código ${code ?? -1}.`,
        ),
      );
    }
  });

  return {
    isRunning: () => running,
    stop: async () => {
      if (!running) return;

      intentionalStop = true;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (running) child.kill();
          resolve();
        }, 5000);

        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });

        child.kill();
      });
    },
  };
}
