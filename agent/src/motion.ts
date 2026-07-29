import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { sanitizeFfmpegError } from "./ffmpeg.js";

const MOTION_WIDTH = 160;
const MOTION_HEIGHT = 90;
const MOTION_FRAME_BYTES = MOTION_WIDTH * MOTION_HEIGHT;

export type MotionSample = {
  capturedAt: string;
  changedPixelPercent: number;
  meanAbsoluteDifference: number;
};

export function calculateMotion(
  previous: Uint8Array,
  current: Uint8Array,
  pixelDifferenceThreshold = 20,
) {
  if (previous.length !== current.length || current.length === 0) {
    throw new Error("Os quadros de movimento precisam ter o mesmo tamanho.");
  }

  let changedPixels = 0;
  let absoluteDifferenceTotal = 0;

  for (let index = 0; index < current.length; index += 1) {
    const difference = Math.abs(
      Number(current[index]) - Number(previous[index]),
    );

    absoluteDifferenceTotal += difference;

    if (difference >= pixelDifferenceThreshold) {
      changedPixels += 1;
    }
  }

  return {
    changedPixelPercent: Number(
      ((changedPixels / current.length) * 100).toFixed(4),
    ),
    meanAbsoluteDifference: Number(
      (absoluteDifferenceTotal / current.length).toFixed(4),
    ),
  };
}

export type MotionSampler = {
  stop: () => Promise<void>;
  isRunning: () => boolean;
};

export function startMotionSampler(options: {
  ffmpegPath: string;
  rtspUrl: string;
  captureIntervalSeconds: number;
  onSample: (sample: MotionSample) => void;
  onError: (error: Error) => void;
}): MotionSampler {
  const interval = Math.max(
    1,
    Math.min(60, Math.floor(options.captureIntervalSeconds || 1)),
  );

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
          const motion = calculateMotion(previous, frame);
          options.onSample({
            capturedAt: new Date().toISOString(),
            ...motion,
          });
        } catch (error) {
          options.onError(
            error instanceof Error ? error : new Error(String(error)),
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

  child.on("error", (error) => {
    running = false;
    if (!intentionalStop) {
      options.onError(error);
    }
  });

  child.on("close", (code) => {
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
        }, 5_000);

        child.once("close", () => {
          clearTimeout(timer);
          resolve();
        });

        child.kill();
      });
    },
  };
}
