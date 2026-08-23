import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LocalEventFrame, LocalMotionEvent } from "./types.js";

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
  timeline?: Record<string, unknown>;
};

type RunResult = { code: number; stderr: string };

function run(executable: string, args: string[], timeoutMs = 45_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let stderr = "";
    let timedOut = false;
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c) => { stderr += String(c); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("A recompressão excedeu o tempo limite."));
      resolve({ code: code ?? -1, stderr });
    });
  });
}

function labelPriority(label: LocalEventFrame["label"]) {
  return ["start", "peak", "end", "extra"].indexOf(label);
}

export function evidenceBudgetForFrameCount(count: number) {
  const safeCount = Math.max(1, Math.min(4, Math.floor(count)));
  return Math.min(MAX_FRAME_BYTES, Math.floor(SAFE_TOTAL_BYTES / safeCount));
}

async function reencodeToBudget(input: { ffmpegPath: string; frame: LocalEventFrame; targetBytes: number }) {
  const source = input.frame.frame.path;
  const originalWidth = input.frame.frame.width ?? 1280;
  const widths = [1280, 1120, 960, 800, 640]
    .map((w) => Math.min(w, originalWidth))
    .filter((w, i, list) => w >= 320 && list.indexOf(w) === i);
  const qualities = [5, 7, 9, 11, 13];
  const directory = path.join(os.tmpdir(), "MonitorIA", "evidence");
  await mkdir(directory, { recursive: true });

  for (const width of widths) {
    for (const quality of qualities) {
      const output = path.join(directory, `${path.basename(source, path.extname(source))}-${width}-${quality}.jpg`);
      await rm(output, { force: true });
      const result = await run(input.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-i", source,
        "-frames:v", "1", "-an", "-vf", `scale=${Math.floor(width / 2) * 2}:-2`,
        "-q:v", String(quality), "-y", output,
      ]);
      if (result.code !== 0) { await rm(output, { force: true }); continue; }
      const s = await stat(output);
      if (s.size >= MIN_FRAME_BYTES && s.size <= input.targetBytes && s.size <= MAX_FRAME_BYTES) return output;
      await rm(output, { force: true });
    }
  }
  return null;
}

export async function prepareEventFramesForUpload(ffmpegPath: string, event: LocalMotionEvent) {
  const ordered = [...event.frames].sort((a, b) => labelPriority(a.label) - labelPriority(b.label));
  const targetBytes = evidenceBudgetForFrameCount(ordered.length);
  const frames: PreparedFrame[] = [];
  const droppedFrameLabels: string[] = [];
  const reencodedLabels: string[] = [];

  for (const item of ordered) {
    let selectedPath = item.frame.path;
    let temporaryPath: string | null = null;
    const sourceTimeline = (item.frame as LocalEventFrame["frame"] & { timeline?: Record<string, unknown> }).timeline;
    try {
      let bytes = await readFile(selectedPath);
      if (bytes.length > targetBytes || bytes.length > MAX_FRAME_BYTES) {
        temporaryPath = await reencodeToBudget({ ffmpegPath, frame: item, targetBytes });
        if (!temporaryPath) { droppedFrameLabels.push(item.label); continue; }
        selectedPath = temporaryPath;
        bytes = await readFile(selectedPath);
        reencodedLabels.push(item.label);
      }
      if (bytes.length < MIN_FRAME_BYTES || bytes.length > MAX_FRAME_BYTES) {
        droppedFrameLabels.push(item.label);
        continue;
      }

      const contentSha256 = createHash("sha256").update(bytes).digest("hex");
      const timeline = sourceTimeline ? {
        ...sourceTimeline,
        ...(sourceTimeline.contentSha256 && sourceTimeline.contentSha256 !== contentSha256
          ? { sourceContentSha256: sourceTimeline.contentSha256 }
          : {}),
        contentSha256,
      } : undefined;

      frames.push({
        label: item.label,
        capturedAt: item.frame.capturedAt,
        imageBase64: bytes.toString("base64"),
        width: temporaryPath ? null : item.frame.width,
        height: temporaryPath ? null : item.frame.height,
        byteSize: bytes.length,
        ...(timeline ? { timeline } : {}),
      });
    } finally {
      if (temporaryPath) await rm(temporaryPath, { force: true });
    }
  }

  let totalBytes = frames.reduce((sum, f) => sum + f.byteSize, 0);
  const removalPriority = ["extra", "end", "start"];
  while (totalBytes > SAFE_TOTAL_BYTES && frames.length > 1) {
    const label = removalPriority.find((candidate) => frames.some((f) => f.label === candidate)) ?? frames.at(-1)?.label;
    const index = frames.findIndex((f) => f.label === label);
    if (index < 0) break;
    const [removed] = frames.splice(index, 1);
    if (!removed) break;
    totalBytes -= removed.byteSize;
    droppedFrameLabels.push(removed.label);
  }

  if (!frames.length) throw new Error("Nenhuma evidência visual pôde ser preparada para envio.");

  return {
    frames,
    diagnostics: {
      sourceFrameCount: event.frames.length,
      submittedFrameCount: frames.length,
      submittedFrameLabels: frames.map((f) => f.label),
      droppedFrameLabels: [...new Set(droppedFrameLabels)],
      reencodedFrameLabels: [...new Set(reencodedLabels)],
      submittedEvidenceBytes: totalBytes,
      evidenceBudgetBytes: SAFE_TOTAL_BYTES,
      timelineEvidence: frames.every((f) => f.timeline?.source === "rtsp_timeline"),
    },
  };
}
