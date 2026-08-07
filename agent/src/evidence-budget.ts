import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  LocalEventFrame,
  LocalMotionEvent,
} from "./types.js";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const SAFE_TOTAL_BYTES = 2_700_000;
const MIN_FRAME_BYTES = 1024;

type PreparedFrame = {
  label: LocalEventFrame["label"];
  capturedAt: string;
  imageBase64: string;
  width: number | null;
  height: number | null;
  byteSize: number;
};

type RunResult = {
  code: number;
  stderr: string;
};

function run(
  executable: string,
  args: string[],
  timeoutMs = 45_000,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let timedOut = false;

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error("A recompressão excedeu o tempo limite."));
        return;
      }
      resolve({ code: code ?? -1, stderr });
    });
  });
}

function labelPriority(label: LocalEventFrame["label"]) {
  const order = ["start", "peak", "end", "extra"];
  return order.indexOf(label);
}

export function evidenceBudgetForFrameCount(count: number) {
  const safeCount = Math.max(1, Math.min(4, Math.floor(count)));
  return Math.min(
    MAX_FRAME_BYTES,
    Math.floor(SAFE_TOTAL_BYTES / safeCount),
  );
}

async function reencodeToBudget(input: {
  ffmpegPath: string;
  frame: LocalEventFrame;
  targetBytes: number;
}) {
  const source = input.frame.frame.path;
  const originalWidth = input.frame.frame.width ?? 1280;
  const widths = [
    Math.min(1280, originalWidth),
    Math.min(1120, originalWidth),
    Math.min(960, originalWidth),
    Math.min(800, originalWidth),
    Math.min(640, originalWidth),
  ].filter((value, index, list) =>
    value >= 320 && list.indexOf(value) === index
  );
  const qualities = [5, 7, 9, 11, 13];
  const directory = path.join(
    os.tmpdir(),
    "MonitorIA",
    "evidence",
  );
  await mkdir(directory, { recursive: true });

  for (const width of widths) {
    for (const quality of qualities) {
      const output = path.join(
        directory,
        `${path.basename(source, path.extname(source))}-${width}-${quality}.jpg`,
      );

      await rm(output, { force: true });

      const result = await run(input.ffmpegPath, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        source,
        "-frames:v",
        "1",
        "-an",
        "-vf",
        `scale=${Math.floor(width / 2) * 2}:-2`,
        "-q:v",
        String(quality),
        "-y",
        output,
      ]);

      if (result.code !== 0) {
        await rm(output, { force: true });
        continue;
      }

      const outputStat = await stat(output);
      if (
        outputStat.size >= MIN_FRAME_BYTES &&
        outputStat.size <= input.targetBytes &&
        outputStat.size <= MAX_FRAME_BYTES
      ) {
        return output;
      }

      await rm(output, { force: true });
    }
  }

  return null;
}

export async function prepareEventFramesForUpload(
  ffmpegPath: string,
  event: LocalMotionEvent,
) {
  const ordered = [...event.frames].sort(
    (left, right) =>
      labelPriority(left.label) - labelPriority(right.label),
  );
  const targetBytes = evidenceBudgetForFrameCount(
    ordered.length,
  );
  const frames: PreparedFrame[] = [];
  const droppedFrameLabels: string[] = [];
  const reencodedLabels: string[] = [];

  for (const item of ordered) {
    let selectedPath = item.frame.path;
    let temporaryPath: string | null = null;

    try {
      let bytes = await readFile(selectedPath);

      if (
        bytes.length > targetBytes ||
        bytes.length > MAX_FRAME_BYTES
      ) {
        temporaryPath = await reencodeToBudget({
          ffmpegPath,
          frame: item,
          targetBytes,
        });

        if (!temporaryPath) {
          droppedFrameLabels.push(item.label);
          continue;
        }

        selectedPath = temporaryPath;
        bytes = await readFile(selectedPath);
        reencodedLabels.push(item.label);
      }

      if (
        bytes.length < MIN_FRAME_BYTES ||
        bytes.length > MAX_FRAME_BYTES
      ) {
        droppedFrameLabels.push(item.label);
        continue;
      }

      frames.push({
        label: item.label,
        capturedAt: item.frame.capturedAt,
        imageBase64: bytes.toString("base64"),
        width: temporaryPath ? null : item.frame.width,
        height: temporaryPath ? null : item.frame.height,
        byteSize: bytes.length,
      });
    } finally {
      if (temporaryPath) {
        await rm(temporaryPath, { force: true });
      }
    }
  }

  let totalBytes = frames.reduce(
    (sum, frame) => sum + frame.byteSize,
    0,
  );

  // Salvaguarda final. O quadro extra é removido primeiro; depois o fim.
  const removalPriority = ["extra", "end", "start"];
  while (totalBytes > SAFE_TOTAL_BYTES && frames.length > 1) {
    const label =
      removalPriority.find((candidate) =>
        frames.some((frame) => frame.label === candidate)
      ) ?? frames.at(-1)?.label;
    const index = frames.findIndex(
      (frame) => frame.label === label,
    );
    if (index < 0) break;

    const [removed] = frames.splice(index, 1);
    if (!removed) break;
    totalBytes -= removed.byteSize;
    droppedFrameLabels.push(removed.label);
  }

  if (!frames.length) {
    throw new Error(
      "Nenhuma evidência visual pôde ser preparada para envio.",
    );
  }

  return {
    frames,
    diagnostics: {
      sourceFrameCount: event.frames.length,
      submittedFrameCount: frames.length,
      submittedFrameLabels: frames.map((frame) => frame.label),
      droppedFrameLabels: [...new Set(droppedFrameLabels)],
      reencodedFrameLabels: [...new Set(reencodedLabels)],
      submittedEvidenceBytes: totalBytes,
      evidenceBudgetBytes: SAFE_TOTAL_BYTES,
    },
  };
}
