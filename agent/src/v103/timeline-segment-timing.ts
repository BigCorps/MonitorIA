import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
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
  const pool = covering.length
    ? covering
    : segments;

  return [...pool].sort((left, right) => {
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
    let all: SegmentLike[] = [];

    do {
      const method =
        (this as any).segments;
      all =
        typeof method === "function"
          ? ((await method.call(
              this,
            )) as SegmentLike[])
          : [];

      if (
        all.some((segment) =>
          segmentContainsTargetV103(
            segment,
            targetMs,
          ),
        )
      ) {
        return all;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 250),
      );
    } while (Date.now() < deadline);

    return all;
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
    let result: RunResult;
    let info;
    let bytes: Buffer;

    try {
      result = await run(
        runtimeOptions.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-ss",
          (offsetMs / 1000).toFixed(3),
          "-i",
          segment.path,
          "-map",
          "0:v:0",
          "-frames:v",
          "1",
          "-an",
          "-vf",
          `scale=${maxWidth}:-2:force_original_aspect_ratio=decrease:out_range=full,format=yuvj420p`,
          "-c:v",
          "mjpeg",
          "-color_range",
          "pc",
          "-q:v",
          String(quality),
          "-update",
          "1",
          "-y",
          output,
        ],
        20_000,
      );

      if (result.code !== 0) {
        throw new Error(
          sanitizeFfmpegError(
            result.stderr,
          ) ||
            "Falha ao extrair evidência da timeline.",
        );
      }

      info = await stat(output);
      if (info.size < 1024) {
        throw new Error(
          "A evidência extraída ficou vazia.",
        );
      }
      bytes = await readFile(output);
    } finally {
      releaseSegment();
    }

    const sha = createHash("sha256")
      .update(bytes)
      .digest("hex");

    return {
      path: output,
      width: null,
      height: null,
      byteSize: info.size,
      capturedAt: new Date(
        targetMs,
      ).toISOString(),
      timeline: {
        source: "rtsp_timeline",
        segmentId: segment.name,
        segmentStartedAt: new Date(
          segment.startedAt,
        ).toISOString(),
        sourceTimestamp: new Date(
          targetMs,
        ).toISOString(),
        offsetMs: Math.round(offsetMs),
        contentSha256: sha,
      },
    };
  };

  installed = true;
}
