import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { sanitizeFfmpegError } from "../ffmpeg.js";
import { resolvePaths } from "../paths.js";
import {
  CameraTimeline,
  type TimelineCapturedFrame,
} from "../v102/timeline.js";
import { protectVideoFiles } from "../v102/disk-budget.js";

const LEGACY_SEGMENT_MS = 3_000;
const SEGMENT_SETTLE_MARGIN_MS = 1_500;
const SEGMENT_WAIT_MS = 20_000;
const MIN_SEGMENT_WINDOW_MS = 250;
const MAX_SEGMENT_WINDOW_MS = 120_000;
const JPEG_RETRY_BACKOFF_MS = [0, 350, 900] as const;

type SegmentLike = {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: number;
  startedAt: number;
};

type TimelineOptionsLike = {
  cameraId: string;
  ffmpegPath: string;
};

type RunResult = {
  code: number;
  stderr: string;
};

let installed = false;

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function parseSegmentIdentity(name: string) {
  const match = /^(\d{13})-(\d{6})\.ts$/i.exec(name);
  if (!match) return null;

  const runKey = match[1];
  const indexText = match[2];
  if (!runKey || !indexText) return null;

  const runStartedAt = Number(runKey);
  const index = Number(indexText);
  if (
    !Number.isFinite(runStartedAt) ||
    !Number.isInteger(index) ||
    index < 0
  ) {
    return null;
  }

  return {
    runStartedAt,
    index,
    runKey,
  };
}

function safeWindowStart(
  candidate: number,
  segment: SegmentLike,
) {
  const duration = segment.modifiedAt - candidate;
  if (
    !Number.isFinite(candidate) ||
    duration < MIN_SEGMENT_WINDOW_MS ||
    duration > MAX_SEGMENT_WINDOW_MS
  ) {
    return segment.startedAt;
  }
  return candidate;
}

/**
 * O muxer segment com `-c:v copy` só fecha um .ts em keyframe. Logo um
 * arquivo configurado para 3 s pode durar 6, 9, 12 s (ou mais), dependendo
 * do GOP do DVR. A 1.0.2 usava sempre `mtime - 3 s`, o que fazia JPEGs de
 * start/end parecerem fora do buffer mesmo quando o vídeo existia em disco.
 *
 * Os nomes do ring carregam o instante em que o processo FFmpeg nasceu e o
 * índice do segmento. Para um mesmo processo, o fechamento do segmento N-1
 * é o início real aproximado do N. Isso permite reconstruir a janela física
 * sem recodificar o stream e sem executar ffprobe para cada arquivo.
 */
export function reconstructSegmentWindowsV103(
  source: SegmentLike[],
): SegmentLike[] {
  const ordered = [...source].sort(
    (left, right) =>
      left.modifiedAt - right.modifiedAt,
  );

  const previousByRun = new Map<
    string,
    { index: number; modifiedAt: number }
  >();

  return ordered.map((segment) => {
    const identity = parseSegmentIdentity(
      segment.name,
    );
    if (!identity) return segment;

    let candidate = segment.startedAt;
    const previous = previousByRun.get(
      identity.runKey,
    );

    if (
      previous &&
      previous.index + 1 === identity.index
    ) {
      candidate = previous.modifiedAt;
    } else if (identity.index === 0) {
      candidate = identity.runStartedAt;
    }

    previousByRun.set(identity.runKey, {
      index: identity.index,
      modifiedAt: segment.modifiedAt,
    });

    return {
      ...segment,
      startedAt: safeWindowStart(
        candidate,
        segment,
      ),
    };
  });
}

export function closedSegmentsV103(
  source: SegmentLike[],
  fileNames: string[],
): SegmentLike[] {
  const identities = fileNames
    .map((name) => parseSegmentIdentity(name))
    .filter((value): value is NonNullable<ReturnType<typeof parseSegmentIdentity>> =>
      value !== null,
    );

  return source.filter((segment) => {
    const identity = parseSegmentIdentity(
      segment.name,
    );
    if (!identity) return false;

    return identities.some((candidate) =>
      (
        candidate.runKey === identity.runKey &&
        candidate.index > identity.index
      ) ||
      candidate.runStartedAt > identity.runStartedAt,
    );
  });
}

async function timelineSegmentFileNames(
  timeline: CameraTimeline,
) {
  const directory = String(
    (timeline as any).directory ?? "",
  );
  if (!directory) return [] as string[];

  try {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });
    return entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".ts"),
      )
      .map((entry) => entry.name);
  } catch {
    return [] as string[];
  }
}

export function segmentContainsTargetV103(
  segment: SegmentLike,
  targetMs: number,
) {
  return (
    targetMs >=
      segment.startedAt -
        SEGMENT_SETTLE_MARGIN_MS &&
    targetMs <=
      segment.modifiedAt +
        SEGMENT_SETTLE_MARGIN_MS
  );
}

export function segmentSeekOffsetMsV103(
  segment: SegmentLike,
  targetMs: number,
) {
  const duration = Math.max(
    50,
    segment.modifiedAt - segment.startedAt,
  );

  return Math.max(
    0,
    Math.min(
      duration - 50,
      targetMs - segment.startedAt,
    ),
  );
}

function selectSegment(
  segments: SegmentLike[],
  targetMs: number,
) {
  const covering = segments.filter((segment) =>
    segmentContainsTargetV103(
      segment,
      targetMs,
    ),
  );
  if (!covering.length) return null;

  return [...covering].sort((left, right) => {
    const leftMid =
      (left.startedAt + left.modifiedAt) / 2;
    const rightMid =
      (right.startedAt + right.modifiedAt) / 2;
    return (
      Math.abs(leftMid - targetMs) -
      Math.abs(rightMid - targetMs)
    );
  })[0] ?? null;
}

function run(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let timedOut = false;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            "A extração de evidência excedeu o limite.",
          ),
        );
        return;
      }
      resolve({
        code: code ?? -1,
        stderr,
      });
    });
  });
}

export function evidenceSeekAttemptsV103(
  offsetMs: number,
) {
  const normalized = Math.max(
    0,
    Math.round(offsetMs),
  );
  return [
    ...new Set(
      JPEG_RETRY_BACKOFF_MS.map((backoff) =>
        Math.max(0, normalized - backoff),
      ),
    ),
  ];
}

export function evidenceSeekPrefixV103(
  segmentPath: string,
  offsetMs: number,
) {
  return [
    "-fflags",
    "+genpts",
    "-i",
    segmentPath,
    "-ss",
    (offsetMs / 1000).toFixed(3),
  ];
}

async function extractJpegWithRetry(
  input: {
    ffmpegPath: string;
    segment: SegmentLike;
    output: string;
    offsetMs: number;
    maxWidth: number;
    quality: number;
  },
) {
  let lastError =
    "FFmpeg encerrou sem produzir o JPEG da evidência.";

  for (const attemptOffsetMs of
    evidenceSeekAttemptsV103(input.offsetMs)) {
    await rm(input.output, {
      force: true,
    }).catch(() => undefined);

    const result = await run(
      input.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        ...evidenceSeekPrefixV103(
          input.segment.path,
          attemptOffsetMs,
        ),
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-an",
        "-vf",
        `scale=${input.maxWidth}:-2:force_original_aspect_ratio=decrease:out_range=full,format=yuvj420p`,
        "-c:v",
        "mjpeg",
        "-color_range",
        "pc",
        "-q:v",
        String(input.quality),
        "-update",
        "1",
        "-y",
        input.output,
      ],
      20_000,
    );

    if (result.code !== 0) {
      lastError =
        sanitizeFfmpegError(result.stderr) ||
        "Falha ao extrair evidência da timeline.";
      continue;
    }

    try {
      const info = await stat(input.output);
      if (info.size < 1024) {
        lastError =
          "A evidência extraída ficou vazia.";
        continue;
      }
      const bytes = await readFile(
        input.output,
      );
      return {
        info,
        bytes,
        offsetMs: attemptOffsetMs,
      };
    } catch {
      lastError =
        "FFmpeg encerrou sem produzir o JPEG da evidência.";
    }
  }

  throw new Error(lastError);
}

export function timelineSegmentTimingContractV103() {
  const runStartedAt = 1_780_000_000_000;
  const source: SegmentLike[] = [
    {
      path: "/tmp/0.ts",
      name: `${runStartedAt}-000000.ts`,
      bytes: 100_000,
      modifiedAt: runStartedAt + 11_000,
      startedAt:
        runStartedAt + 11_000 -
        LEGACY_SEGMENT_MS,
    },
    {
      path: "/tmp/1.ts",
      name: `${runStartedAt}-000001.ts`,
      bytes: 100_000,
      modifiedAt: runStartedAt + 19_000,
      startedAt:
        runStartedAt + 19_000 -
        LEGACY_SEGMENT_MS,
    },
  ];

  const reconstructed =
    reconstructSegmentWindowsV103(source);
  const first = reconstructed[0]!;
  const second = reconstructed[1]!;

  const closed = closedSegmentsV103(
    reconstructed,
    source.map((segment) => segment.name),
  );
  const seekPrefix = evidenceSeekPrefixV103(
    first.path,
    8_000,
  );

  return {
    variableGopWindow:
      first.startedAt === runStartedAt &&
      second.startedAt ===
        first.modifiedAt,
    longSegmentSeekPreserved:
      segmentSeekOffsetMsV103(
        first,
        runStartedAt + 8_000,
      ) === 8_000,
    closedSegmentGate:
      closed.length === 1 &&
      closed[0]?.name === first.name,
    decodeBeforeSeek:
      seekPrefix.indexOf("-i") <
      seekPrefix.indexOf("-ss"),
    jpegRetryAttempts:
      evidenceSeekAttemptsV103(2_000).length,
    extendedWaitMs: SEGMENT_WAIT_MS,
  } as const;
}

/**
 * Corrige somente a execução 1.0.3. A 1.0.2 standalone permanece exatamente
 * com a timeline homologada anterior.
 */
export function installV103TimelineSegmentTiming() {
  if (installed) return;

  const proto =
    CameraTimeline.prototype as any;
  const originalSegments = proto.segments;

  if (
    typeof originalSegments !== "function" ||
    typeof proto.waitForSegments !== "function" ||
    typeof proto.captureAt !== "function"
  ) {
    throw new Error(
      "monitoria_v103_timeline_segment_timing_contract_mismatch",
    );
  }

  proto.segments = async function (
    this: CameraTimeline,
  ) {
    const result =
      (await originalSegments.call(
        this,
      )) as SegmentLike[];

    return reconstructSegmentWindowsV103(
      Array.isArray(result) ? result : [],
    );
  };

  proto.waitForSegments = async function (
    this: CameraTimeline,
    targetMs: number,
  ) {
    const deadline =
      Date.now() + SEGMENT_WAIT_MS;
    let closed: SegmentLike[] = [];

    do {
      const method =
        (this as any).segments;
      const all =
        typeof method === "function"
          ? ((await method.call(
              this,
            )) as SegmentLike[])
          : [];
      const fileNames =
        await timelineSegmentFileNames(this);
      closed = closedSegmentsV103(
        all,
        fileNames,
      );

      if (
        closed.some((segment) =>
          segmentContainsTargetV103(
            segment,
            targetMs,
          ),
        )
      ) {
        return closed;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 250),
      );
    } while (Date.now() < deadline);

    return closed;
  };

  proto.captureAt = async function (
    this: CameraTimeline,
    targetAt: string,
    options: {
      maxWidth?: number;
      quality?: number;
      prefix?: string;
    } = {},
  ): Promise<TimelineCapturedFrame> {
    const targetMs = Date.parse(targetAt);
    if (!Number.isFinite(targetMs)) {
      throw new Error(
        "Horário inválido para a evidência da timeline.",
      );
    }

    const wait =
      (this as any).waitForSegments;
    const segments =
      (await wait.call(
        this,
        targetMs,
      )) as SegmentLike[];

    const segment = selectSegment(
      segments,
      targetMs,
    );
    if (!segment) {
      throw new Error(
        "A timeline local ainda não possui segmento para a evidência.",
      );
    }

    const offsetMs =
      segmentSeekOffsetMsV103(
        segment,
        targetMs,
      );

    const runtime = this as any;
    const runtimeOptions =
      runtime.options as TimelineOptionsLike;
    const layout =
      await resolvePaths();
    const dataRoot =
      String(runtime.dataRoot || layout.root);
    const directory = path.join(
      dataRoot,
      "pending-event-frames",
      safeId(runtimeOptions.cameraId),
    );
    await mkdir(directory, {
      recursive: true,
    });

    const safePrefix = String(
      options.prefix ?? "timeline",
    )
      .replace(/[^A-Za-z0-9_-]/g, "-")
      .slice(0, 80);
    const output = path.join(
      directory,
      `${safeId(
        runtimeOptions.cameraId,
      )}-${safePrefix}-${Date.now()}.jpg`,
    );
    const maxWidth = Math.max(
      320,
      Math.min(
        1920,
        Math.floor(
          options.maxWidth ?? 1280,
        ),
      ),
    );
    const quality = Math.max(
      2,
      Math.min(
        12,
        Math.floor(options.quality ?? 3),
      ),
    );

    const releaseSegment =
      protectVideoFiles([segment.path]);
    let extracted: Awaited<
      ReturnType<typeof extractJpegWithRetry>
    >;

    try {
      extracted = await extractJpegWithRetry({
        ffmpegPath: runtimeOptions.ffmpegPath,
        segment,
        output,
        offsetMs,
        maxWidth,
        quality,
      });
    } finally {
      releaseSegment();
    }

    const sha = createHash("sha256")
      .update(extracted.bytes)
      .digest("hex");
    const capturedAtMs =
      segment.startedAt + extracted.offsetMs;

    return {
      path: output,
      width: null,
      height: null,
      byteSize: extracted.info.size,
      capturedAt: new Date(
        capturedAtMs,
      ).toISOString(),
      timeline: {
        source: "rtsp_timeline",
        segmentId: segment.name,
        segmentStartedAt: new Date(
          segment.startedAt,
        ).toISOString(),
        sourceTimestamp: new Date(
          capturedAtMs,
        ).toISOString(),
        offsetMs: Math.round(
          extracted.offsetMs,
        ),
        contentSha256: sha,
      },
    };
  };

  installed = true;
}
