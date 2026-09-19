"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./video-lab.module.css";

const MAX_VIDEO_SECONDS = 60 * 60;
const DETECTION_WIDTH = 160;
const JPEG_MAX_WIDTH = 640;
const MAX_CANDIDATES_SHOWN = 60;
const FFMPEG_CORE_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const COMPATIBILITY_SCAN_MIN_HEIGHT = 72;

type ScanMode = "fast" | "balanced" | "detailed";
type DecoderMode = "native" | "compatibility";

type Candidate = {
  id: string;
  startedAtSeconds: number;
  peakAtSeconds: number;
  endedAtSeconds: number;
  peakScore: number;
  meanScore: number;
  samples: number;
};

type FrameLabel = "start" | "peak" | "end" | "extra";

type CapturedFrame = {
  label: FrameLabel;
  capturedAt: string;
  imageUrl: string;
};

type AnalysisResponse = {
  event?: {
    summary?: string;
    headline?: string;
    primaryEventType?: string;
    confidence?: number;
    requiresReview?: boolean;
    [key: string]: unknown;
  };
  provider?: string;
  model?: string;
  usage?: {
    inputTokens?: number;
    cachedInputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
  latencyMs?: number;
  error?: string;
};

type AnalysisItem = {
  candidate: Candidate;
  response: AnalysisResponse;
  frameCount: number;
  sentBytes: number;
};

type VideoInfo = {
  duration: number;
  durationKnown: boolean;
  width: number;
  height: number;
  size: number;
  name: string;
};

const modeConfig: Record<
  ScanMode,
  { label: string; interval: number; description: string }
> = {
  fast: {
    label: "Rápido",
    interval: 5,
    description: "Amostra a cada 5 s. Bom para uma primeira leitura de vídeos longos.",
  },
  balanced: {
    label: "Equilibrado",
    interval: 3,
    description: "Amostra a cada 3 s. Melhor equilíbrio para o teste inicial.",
  },
  detailed: {
    label: "Detalhado",
    interval: 2,
    description: "Amostra a cada 2 s. Encontra mudanças curtas, mas leva mais tempo.",
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2,
  })} ${units[index]}`;
}

function defaultStartLocal(duration: number) {
  const date = new Date(Date.now() - Math.max(0, duration) * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function seekVideo(video: HTMLVideoElement, seconds: number) {
  const target = clamp(seconds, 0, Math.max(0, video.duration - 0.05));

  if (
    video.readyState >= 2 &&
    Math.abs(video.currentTime - target) < 0.04
  ) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("O navegador demorou demais para acessar um trecho do vídeo."));
    }, 12_000);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Não foi possível decodificar um trecho desta gravação."));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = target;
  });
}

function lumaFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const aspect =
    video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoHeight / video.videoWidth
      : 9 / 16;
  canvas.width = DETECTION_WIDTH;
  canvas.height = Math.max(72, Math.round(DETECTION_WIDTH * aspect));

  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas indisponível neste navegador.");

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const result = new Uint8Array(canvas.width * canvas.height);

  for (let source = 0, target = 0; source < pixels.length; source += 4, target += 1) {
    result[target] = Math.round(
      (pixels[source]! * 3 + pixels[source + 1]! * 6 + pixels[source + 2]!) / 10,
    );
  }

  return result;
}

function changeScore(previous: Uint8Array, current: Uint8Array) {
  const length = Math.min(previous.length, current.length);
  if (!length) return 0;

  let previousMean = 0;
  let currentMean = 0;
  for (let index = 0; index < length; index += 1) {
    previousMean += previous[index]!;
    currentMean += current[index]!;
  }
  previousMean /= length;
  currentMean /= length;

  const globalShift = currentMean - previousMean;
  let changed = 0;

  // Retira a mudança média de brilho para reduzir falsos positivos causados por
  // exposição automática, nuvens e IR. O score final é a fração do quadro que
  // realmente mudou depois dessa compensação simples.
  for (let index = 0; index < length; index += 1) {
    const delta = current[index]! - previous[index]! - globalShift;
    if (Math.abs(delta) >= 18) changed += 1;
  }

  return (changed / length) * 100;
}

function sensitivityThreshold(sensitivity: number) {
  // Sensibilidade 1 = exige aproximadamente 13% do quadro mudando.
  // Sensibilidade 10 = cerca de 4%. O laboratório mostra o valor calculado.
  return clamp(14 - sensitivity, 4, 13);
}

function dataUrlBytes(value: string) {
  const comma = value.indexOf(",");
  const base64 = comma >= 0 ? value.slice(comma + 1) : value;
  return Math.floor((base64.length * 3) / 4);
}

async function captureJpeg(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  seconds: number,
) {
  await seekVideo(video, seconds);

  const width = Math.min(JPEG_MAX_WIDTH, Math.max(1, video.videoWidth));
  const aspect =
    video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoHeight / video.videoWidth
      : 9 / 16;
  const height = Math.max(1, Math.round(width * aspect));

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponível neste navegador.");

  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.68);
}



type CompatibilityInfo = {
  codec: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
};

type CompatibilityScanResult = {
  candidates: Candidate[];
  inferredDuration: number;
};

function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

async function remoteAssetAsBlobUrl(url: string, mimeType: string) {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) {
    throw new Error(
      `Não foi possível carregar o decodificador local (HTTP ${response.status}).`,
    );
  }
  const bytes = await response.arrayBuffer();
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
}

function fileDataText(value: string | Uint8Array) {
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

function unknownErrorText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

type FfmpegLogEvent = {
  message: string;
};

type FfmpegProgressEvent = {
  progress: number;
};

type BrowserFfmpegInstance = {
  on: {
    (event: "log", listener: (event: FfmpegLogEvent) => void): void;
    (event: "progress", listener: (event: FfmpegProgressEvent) => void): void;
  };
  load(options: {
    coreURL: string;
    wasmURL: string;
  }): Promise<boolean>;
  createDir(path: string): Promise<boolean>;
  mount(
    fsType: string,
    options: { files: File[] },
    mountPoint: string,
  ): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  ffprobe(args: string[]): Promise<number>;
  exec(args: string[]): Promise<number>;
  terminate(): void;
};

type BrowserFfmpegModule = {
  FFmpeg: new () => BrowserFfmpegInstance;
  FFFSType: {
    WORKERFS: string;
  };
};

const FFMPEG_BROWSER_MODULE_URL = "/vendor/ffmpeg/index.js";

async function loadFfmpegBrowserModule(): Promise<BrowserFfmpegModule> {
  // Usa o import ESM nativo do navegador, sem o Turbopack reescrever
  // classes.js/worker.js e seus URLs dinâmicos internos.
  const nativeImport = new Function(
    "url",
    "return import(url)",
  ) as (url: string) => Promise<BrowserFfmpegModule>;

  return nativeImport(FFMPEG_BROWSER_MODULE_URL);
}

async function createLocalFfmpegRuntime(
  sourceFile: File,
  onStage: (message: string) => void,
  onProgress?: (percent: number) => void,
) {
  onStage("Carregando decodificador local de vídeo...");

  const { FFmpeg, FFFSType } =
    await loadFfmpegBrowserModule();
  const ffmpeg = new FFmpeg();
  const temporaryUrls: string[] = [];
  const logs: string[] = [];

  ffmpeg.on("log", ({ message }) => {
    logs.push(message);
    if (logs.length > 30) logs.shift();
  });

  if (onProgress) {
    ffmpeg.on("progress", ({ progress }) => {
      if (!Number.isFinite(progress)) return;
      onProgress(clamp(Math.round(progress * 100), 0, 99));
    });
  }

  const coreURL = await remoteAssetAsBlobUrl(
    `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
    "text/javascript",
  );
  const wasmURL = await remoteAssetAsBlobUrl(
    `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
    "application/wasm",
  );
  temporaryUrls.push(coreURL, wasmURL);

  try {
    try {
      await ffmpeg.load({ coreURL, wasmURL });
    } catch (error) {
      throw new Error(
        `Falha ao iniciar FFmpeg/WASM: ${unknownErrorText(error)}`,
      );
    }

    await ffmpeg.createDir("/monitoria-input").catch(() => undefined);
    const inputPath = `/monitoria-input/${sourceFile.name}`;
    let inputMode: "workerfs" | "memory" = "workerfs";

    try {
      const mounted = await ffmpeg.mount(
        FFFSType.WORKERFS,
        { files: [sourceFile] },
        "/monitoria-input",
      );
      if (!mounted) {
        throw new Error("WORKERFS retornou false.");
      }
      onStage("Arquivo montado localmente sem copiar o vídeo para a memória.");
    } catch (mountError) {
      const MEMORY_FALLBACK_LIMIT = 350 * 1024 * 1024;
      if (sourceFile.size > MEMORY_FALLBACK_LIMIT) {
        throw new Error(
          `Falha ao montar o arquivo local com WORKERFS (${unknownErrorText(mountError)}). ` +
          `Como o arquivo possui ${formatBytes(sourceFile.size)}, ele excede o limite de ` +
          `${formatBytes(MEMORY_FALLBACK_LIMIT)} do fallback em memória deste POC.`,
        );
      }

      inputMode = "memory";
      onStage(
        `WORKERFS indisponível neste navegador. Copiando ${formatBytes(sourceFile.size)} somente para a memória local do decodificador...`,
      );

      try {
        const bytes = new Uint8Array(await sourceFile.arrayBuffer());
        await ffmpeg.writeFile(inputPath, bytes);
      } catch (writeError) {
        throw new Error(
          `Falha também no fallback local em memória: ${unknownErrorText(writeError)}`,
        );
      }
    }

    return {
      ffmpeg,
      inputPath,
      inputMode,
      logs,
      temporaryUrls,
    };
  } catch (error) {
    ffmpeg.terminate();
    for (const url of temporaryUrls) URL.revokeObjectURL(url);
    throw error;
  }
}

function closeLocalFfmpegRuntime(runtime: {
  ffmpeg: { terminate: () => void };
  temporaryUrls: string[];
}) {
  runtime.ffmpeg.terminate();
  for (const url of runtime.temporaryUrls) URL.revokeObjectURL(url);
}

async function inspectCompatibilityVideo(
  sourceFile: File,
  onStage: (message: string) => void,
): Promise<CompatibilityInfo> {
  const runtime = await createLocalFfmpegRuntime(sourceFile, onStage);

  try {
    onStage(
      `Identificando codec e metadados localmente (${runtime.inputMode === "workerfs" ? "arquivo montado" : "memória local"})...`,
    );

    const probePath = "/monitoria-probe.json";
    let probe:
      | {
          streams?: Array<{
            codec_name?: string;
            width?: number;
            height?: number;
            duration?: string;
          }>;
          format?: { duration?: string };
        }
      | null = null;

    try {
      const probeCode = await runtime.ffmpeg.ffprobe([
        "-v",
        "error",
        "-probesize",
        "100M",
        "-analyzeduration",
        "100M",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,width,height,duration:format=duration",
        "-of",
        "json",
        "-o",
        probePath,
        runtime.inputPath,
      ]);

      if (probeCode === 0) {
        const rawProbe = await runtime.ffmpeg.readFile(probePath, "utf8");
        probe = JSON.parse(fileDataText(rawProbe));
      }
    } catch {
      probe = null;
    }

    const stream = probe?.streams?.[0];
    let durationValue = Number(
      probe?.format?.duration ?? stream?.duration ?? 0,
    );
    let widthValue = Number(stream?.width ?? 0);
    let heightValue = Number(stream?.height ?? 0);
    let codec = stream?.codec_name ?? null;

    if (
      !Number.isFinite(durationValue) ||
      durationValue <= 0 ||
      !Number.isFinite(widthValue) ||
      widthValue <= 0 ||
      !Number.isFinite(heightValue) ||
      heightValue <= 0
    ) {
      runtime.logs.length = 0;
      await runtime.ffmpeg.exec([
        "-hide_banner",
        "-probesize",
        "100M",
        "-analyzeduration",
        "100M",
        "-err_detect",
        "ignore_err",
        "-i",
        runtime.inputPath,
      ]).catch(() => undefined);

      const text = runtime.logs.join("\n");
      const durationMatch = text.match(
        /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i,
      );
      if (durationMatch) {
        durationValue =
          Number(durationMatch[1]) * 3600 +
          Number(durationMatch[2]) * 60 +
          Number(durationMatch[3]);
      }

      const videoLine =
        text.split("\n").find((line) => /Video:/i.test(line)) ?? "";

      const sizeMatch = videoLine.match(/(\d{2,5})x(\d{2,5})/);
      if (sizeMatch) {
        widthValue = Number(sizeMatch[1]);
        heightValue = Number(sizeMatch[2]);
      }

      const codecMatch = videoLine.match(/Video:\s*([^,\s]+)/i);
      if (codecMatch) codec = codecMatch[1].toLowerCase();

      if (!codec && /\[hevc\s*@|Video:\s*hevc/i.test(text)) {
        codec = "hevc";
      }
    }

    const duration =
      Number.isFinite(durationValue) && durationValue > 0
        ? durationValue
        : null;
    const width =
      Number.isFinite(widthValue) && widthValue > 0
        ? widthValue
        : null;
    const height =
      Number.isFinite(heightValue) && heightValue > 0
        ? heightValue
        : null;

    return { codec, duration, width, height };
  } catch (error) {
    throw new Error(
      `Falha ao inspecionar a gravação: ${unknownErrorText(error)}`,
    );
  } finally {
    closeLocalFfmpegRuntime(runtime);
  }
}

function candidateFromOpen(
  open: {
    startedAtSeconds: number;
    peakAtSeconds: number;
    endedAtSeconds: number;
    peakScore: number;
    scoreSum: number;
    samples: number;
  },
  index: number,
  interval: number,
  duration: number,
): Candidate {
  return {
    id: `candidate-${index + 1}`,
    startedAtSeconds: open.startedAtSeconds,
    peakAtSeconds: open.peakAtSeconds,
    endedAtSeconds: Math.min(
      duration,
      Math.max(open.endedAtSeconds + interval, open.peakAtSeconds + interval),
    ),
    peakScore: open.peakScore,
    meanScore: open.scoreSum / Math.max(1, open.samples),
    samples: open.samples,
  };
}

async function scanCompatibilityVideo(
  sourceFile: File,
  videoInfo: VideoInfo,
  interval: number,
  threshold: number,
  onStage: (message: string) => void,
  onProgress: (percent: number) => void,
): Promise<CompatibilityScanResult> {
  const runtime = await createLocalFfmpegRuntime(
    sourceFile,
    onStage,
    onProgress,
  );

  try {
    const scanHeight = 90;
    const outputPath = "/monitoria-scan.raw";

    onStage(
      `Decodificando miniaturas locais a cada ${interval}s. Frames HEVC inválidos no início serão ignorados.`,
    );

    runtime.logs.length = 0;
    const code = await runtime.ffmpeg.exec([
      "-hide_banner",
      "-loglevel",
      "warning",
      "-probesize",
      "100M",
      "-analyzeduration",
      "100M",
      "-fflags",
      "+genpts+discardcorrupt",
      "-err_detect",
      "ignore_err",
      "-i",
      runtime.inputPath,
      "-t",
      String(MAX_VIDEO_SECONDS),
      "-map",
      "0:v:0",
      "-vf",
      `fps=1/${interval},scale=${DETECTION_WIDTH}:${scanHeight}:flags=fast_bilinear,format=gray`,
      "-an",
      "-sn",
      "-dn",
      "-pix_fmt",
      "gray",
      "-f",
      "rawvideo",
      outputPath,
    ]);

    let raw: string | Uint8Array | null = null;
    try {
      raw = await runtime.ffmpeg.readFile(outputPath);
    } catch {
      raw = null;
    }

    if (!raw || typeof raw === "string" || raw.byteLength === 0) {
      const tail = runtime.logs.slice(-12).join(" | ");
      throw new Error(
        `O arquivo não gerou miniaturas decodificáveis.` +
        (tail ? ` Log: ${tail}` : ` Código FFmpeg: ${code}`),
      );
    }

    const frameSize = DETECTION_WIDTH * scanHeight;
    const frameCount = Math.floor(raw.byteLength / frameSize);
    if (frameCount < 2) {
      throw new Error(
        "Foram obtidos poucos quadros válidos para mapear acontecimentos.",
      );
    }

    const inferredDuration = Math.min(
      MAX_VIDEO_SECONDS,
      Math.max(interval, frameCount * interval),
    );

    let previous: Uint8Array | null = null;
    let open:
      | {
          startedAtSeconds: number;
          peakAtSeconds: number;
          endedAtSeconds: number;
          peakScore: number;
          scoreSum: number;
          samples: number;
          quietSamples: number;
        }
      | null = null;
    const found: Candidate[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const offset = index * frameSize;
      const current = raw.subarray(offset, offset + frameSize);
      const time = Math.min(inferredDuration, index * interval);

      if (previous) {
        const score = changeScore(previous, current);
        const active = score >= threshold;

        if (active) {
          if (!open) {
            open = {
              startedAtSeconds: Math.max(0, time - interval),
              peakAtSeconds: time,
              endedAtSeconds: time,
              peakScore: score,
              scoreSum: score,
              samples: 1,
              quietSamples: 0,
            };
          } else {
            open.endedAtSeconds = time;
            open.scoreSum += score;
            open.samples += 1;
            open.quietSamples = 0;
            if (score > open.peakScore) {
              open.peakScore = score;
              open.peakAtSeconds = time;
            }
          }
        } else if (open) {
          open.quietSamples += 1;
          if (open.quietSamples >= 2) {
            const duration =
              open.endedAtSeconds - open.startedAtSeconds;
            if (duration >= interval * 0.5) {
              found.push(
                candidateFromOpen(
                  open,
                  found.length,
                  interval,
                  inferredDuration,
                ),
              );
            }
            open = null;
          }
        }
      }

      previous = new Uint8Array(current);
      if (index % 24 === 0) {
        const percent = Math.round(((index + 1) / frameCount) * 100);
        onProgress(percent);
        onStage(
          `Mapeando miniaturas locais · ${percent}% · ${found.length}${open ? "+" : ""} candidatos`,
        );
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, 0),
        );
      }
    }

    if (open) {
      found.push(
        candidateFromOpen(
          open,
          found.length,
          interval,
          inferredDuration,
        ),
      );
    }

    return {
      inferredDuration,
      candidates: found
        .filter(
          (item) =>
            item.endedAtSeconds > item.startedAtSeconds &&
            Number.isFinite(item.peakScore),
        )
        .sort((left, right) => left.startedAtSeconds - right.startedAtSeconds)
        .slice(0, MAX_CANDIDATES_SHOWN),
    };
  } finally {
    closeLocalFfmpegRuntime(runtime);
  }
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  return new Promise<string>((resolve, reject) => {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Não foi possível preparar a imagem extraída."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(new Blob([copy.buffer], { type: mimeType }));
  });
}

async function extractCompatibilityFrames(
  sourceFile: File,
  candidate: Candidate,
  isoAt: (seconds: number) => string,
  onStage: (message: string) => void,
): Promise<CapturedFrame[]> {
  const points: Array<{ label: FrameLabel; seconds: number }> = [
    { label: "start", seconds: candidate.startedAtSeconds },
    { label: "peak", seconds: candidate.peakAtSeconds },
    { label: "end", seconds: candidate.endedAtSeconds },
  ];

  const unique: Array<{ label: FrameLabel; seconds: number }> = [];
  for (const point of points) {
    if (
      !unique.some(
        (existing) => Math.abs(existing.seconds - point.seconds) < 0.35,
      )
    ) {
      unique.push(point);
    }
  }

  const runtime = await createLocalFfmpegRuntime(sourceFile, onStage);
  const frames: CapturedFrame[] = [];

  try {
    for (let index = 0; index < unique.length; index += 1) {
      const point = unique[index]!;
      const outputPath = `/monitoria-evidence-${index}.jpg`;

      onStage(
        `Extraindo evidência local de ${formatDuration(point.seconds)}...`,
      );

      const code = await runtime.ffmpeg.exec([
        "-hide_banner",
        "-loglevel",
        "warning",
        "-probesize",
        "100M",
        "-analyzeduration",
        "100M",
        "-fflags",
        "+genpts+discardcorrupt",
        "-err_detect",
        "ignore_err",
        "-i",
        runtime.inputPath,
        "-ss",
        Math.max(0, point.seconds).toFixed(3),
        "-map",
        "0:v:0",
        "-frames:v",
        "1",
        "-vf",
        `scale=w='min(${JPEG_MAX_WIDTH},iw)':h=-2:flags=fast_bilinear`,
        "-q:v",
        "4",
        "-an",
        "-sn",
        "-dn",
        outputPath,
      ]);

      if (code !== 0) {
        throw new Error(
          `Não foi possível extrair o quadro em ${formatDuration(point.seconds)}.`,
        );
      }

      const raw = await runtime.ffmpeg.readFile(outputPath);
      if (typeof raw === "string" || !raw.byteLength) {
        throw new Error(
          `A evidência de ${formatDuration(point.seconds)} ficou vazia.`,
        );
      }

      frames.push({
        label: point.label,
        capturedAt: isoAt(point.seconds),
        imageUrl: await bytesToDataUrl(raw, "image/jpeg"),
      });
    }

    return frames;
  } finally {
    closeLocalFfmpegRuntime(runtime);
  }
}

function resultTitle(response: AnalysisResponse) {
  return String(
    response.event?.headline ||
      response.event?.summary ||
      response.error ||
      "Sem resultado",
  );
}

export function VideoLabClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const compatibilityAttemptRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [decoderMode, setDecoderMode] = useState<DecoderMode | null>(null);
  const [sourceCodec, setSourceCodec] = useState<string | null>(null);
  const [preparingCompatibility, setPreparingCompatibility] = useState(false);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [startLocal, setStartLocal] = useState("");
  const [mode, setMode] = useState<ScanMode>("balanced");
  const [sensitivity, setSensitivity] = useState(7);
  const [maxAiEvents, setMaxAiEvents] = useState(6);
  const [environment, setEnvironment] = useState(
    "Câmera fixa de segurança em ambiente comercial.",
  );
  const [goal, setGoal] = useState(
    "Descrever movimentações e acontecimentos relevantes sem inventar detalhes não visíveis.",
  );
  const [status, setStatus] = useState("Selecione uma gravação para começar.");
  const [progress, setProgress] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const threshold = useMemo(
    () => sensitivityThreshold(sensitivity),
    [sensitivity],
  );

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function clearRunState() {
    setCandidates([]);
    setAnalysis([]);
    setProgress(0);
    setError(null);
  }

  function onSelectFile(nextFile: File | null) {
    clearRunState();
    fileRef.current = nextFile;
    compatibilityAttemptRef.current = false;
    setFile(nextFile);
    setVideoInfo(null);
    setDecoderMode(null);
    setSourceCodec(null);
    setPreparingCompatibility(false);

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    if (!nextFile) {
      video.removeAttribute("src");
      video.load();
      setStatus("Selecione uma gravação para começar.");
      return;
    }

    const objectUrl = URL.createObjectURL(nextFile);
    objectUrlRef.current = objectUrl;
    video.src = objectUrl;
    video.load();
    setStatus("Identificando formato e codec localmente...");
  }

  function onMetadataLoaded() {
    const video = videoRef.current;
    if (!video || !file) return;

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      setError("O navegador não conseguiu determinar a duração do vídeo.");
      return;
    }

    if (video.duration > MAX_VIDEO_SECONDS + 0.5) {
      setError(
        `Este POC aceita até 1 hora. O arquivo possui ${formatDuration(video.duration)}.`,
      );
      setStatus("Arquivo acima do limite do laboratório.");
      return;
    }

    const compatibility = compatibilityAttemptRef.current;
    setError(null);
    setDecoderMode(compatibility ? "compatibility" : "native");
    setVideoInfo({
      duration: video.duration,
      durationKnown: true,
      width: video.videoWidth,
      height: video.videoHeight,
      size: file.size,
      name: file.name,
    });
    setStartLocal(defaultStartLocal(video.duration));
    setProgress(compatibility ? 100 : 0);
    setStatus(
      compatibility
        ? `Arquivo preparado em modo compatibilidade local${sourceCodec ? ` (${sourceCodec.toUpperCase()})` : ""}. O original não saiu deste dispositivo.`
        : "Arquivo pronto. O vídeo ainda não saiu deste dispositivo.",
    );
  }

  async function onVideoError() {
    const selectedFile = fileRef.current;
    const video = videoRef.current;
    if (!selectedFile || !video) return;

    if (compatibilityAttemptRef.current) return;

    compatibilityAttemptRef.current = true;
    setPreparingCompatibility(true);
    setError(null);
    setVideoInfo(null);
    setProgress(0);
    setStatus(
      "O navegador não abriu o codec original. Lendo o arquivo diretamente com o decodificador local...",
    );

    try {
      const info = await inspectCompatibilityVideo(
        selectedFile,
        (message) => setStatus(message),
      );

      if (fileRef.current !== selectedFile) return;

      if (info.duration && info.duration > MAX_VIDEO_SECONDS + 0.5) {
        throw new Error(
          `Este POC aceita até 1 hora. O arquivo possui ${formatDuration(info.duration)}.`,
        );
      }

      setSourceCodec(info.codec);
      setDecoderMode("compatibility");
      setVideoInfo({
        duration: info.duration ?? MAX_VIDEO_SECONDS,
        durationKnown: Boolean(info.duration),
        width: info.width ?? 0,
        height: info.height ?? 0,
        size: selectedFile.size,
        name: selectedFile.name,
      });
      setStartLocal(
        info.duration ? defaultStartLocal(info.duration) : "",
      );
      setProgress(0);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      video.removeAttribute("src");
      video.load();

      setStatus(
        info.duration
          ? `${info.codec ? info.codec.toUpperCase() : "Codec"} detectado. O navegador não precisa reproduzir o vídeo: o MonitorIA vai extrair miniaturas diretamente do arquivo local.`
          : `${info.codec ? info.codec.toUpperCase() : "Stream de câmera"} detectado sem duração de container. Isso é comum em alguns exports de DVR; a duração será inferida durante o mapeamento e o POC limitará a leitura à primeira hora.`,
      );
    } catch (compatibilityError) {
      compatibilityAttemptRef.current = false;
      setError(
        `Não foi possível ler esta gravação com o modo compatibilidade. ${unknownErrorText(compatibilityError)}`,
      );
      setStatus(
        "Formato não reconhecido automaticamente. O arquivo original não foi enviado.",
      );
    } finally {
      setPreparingCompatibility(false);
    }
  }

  async function scanVideo() {
    const canvas = detectionCanvasRef.current;
    if (!videoInfo) return;

    if (decoderMode === "compatibility") {
      const selectedFile = fileRef.current;
      if (!selectedFile) return;

      setScanning(true);
      setError(null);
      setAnalysis([]);
      setCandidates([]);
      setProgress(0);

      try {
        const interval = modeConfig[mode].interval;
        const result = await scanCompatibilityVideo(
          selectedFile,
          videoInfo,
          interval,
          threshold,
          (message) => setStatus(message),
          (percent) => setProgress(percent),
        );

        setVideoInfo((current) =>
          current
            ? {
                ...current,
                duration: result.inferredDuration,
                durationKnown: true,
              }
            : current,
        );
        setStartLocal((current) =>
          current || defaultStartLocal(result.inferredDuration),
        );
        setCandidates(result.candidates);
        setProgress(100);
        setStatus(
          result.candidates.length
            ? `${result.candidates.length} possíveis acontecimentos encontrados diretamente no arquivo ${sourceCodec ? sourceCodec.toUpperCase() : "compatível"} · duração inferida ${formatDuration(result.inferredDuration)} · vídeo original continua local.`
            : `Nenhuma mudança acima do limiar foi encontrada em ${formatDuration(result.inferredDuration)} de vídeo decodificado. Tente aumentar a sensibilidade.`,
        );
      } catch (scanError) {
        setError(
          scanError instanceof Error
            ? scanError.message
            : "Falha desconhecida ao decodificar o vídeo localmente.",
        );
        setStatus("A leitura local foi interrompida.");
      } finally {
        setScanning(false);
      }
      return;
    }

    const video = videoRef.current;
    if (!video || !canvas) return;

    setScanning(true);
    setError(null);
    setAnalysis([]);
    setCandidates([]);
    setProgress(0);

    const interval = modeConfig[mode].interval;
    const sampleTimes: number[] = [];
    for (let time = 0; time < videoInfo.duration; time += interval) {
      sampleTimes.push(time);
    }
    if (sampleTimes.at(-1) !== videoInfo.duration - 0.05) {
      sampleTimes.push(Math.max(0, videoInfo.duration - 0.05));
    }

    let previous: Uint8Array | null = null;
    let open:
      | {
          startedAtSeconds: number;
          peakAtSeconds: number;
          endedAtSeconds: number;
          peakScore: number;
          scoreSum: number;
          samples: number;
          quietSamples: number;
        }
      | null = null;
    const found: Candidate[] = [];

    try {
      video.pause();

      for (let index = 0; index < sampleTimes.length; index += 1) {
        const time = sampleTimes[index]!;
        await seekVideo(video, time);
        const current = lumaFrame(video, canvas);

        if (previous) {
          const score = changeScore(previous, current);
          const active = score >= threshold;

          if (active) {
            if (!open) {
              open = {
                startedAtSeconds: Math.max(0, time - interval),
                peakAtSeconds: time,
                endedAtSeconds: time,
                peakScore: score,
                scoreSum: score,
                samples: 1,
                quietSamples: 0,
              };
            } else {
              open.endedAtSeconds = time;
              open.scoreSum += score;
              open.samples += 1;
              open.quietSamples = 0;
              if (score > open.peakScore) {
                open.peakScore = score;
                open.peakAtSeconds = time;
              }
            }
          } else if (open) {
            open.quietSamples += 1;
            if (open.quietSamples >= 2) {
              const duration = open.endedAtSeconds - open.startedAtSeconds;
              if (duration >= interval * 0.5) {
                found.push({
                  id: `candidate-${found.length + 1}`,
                  startedAtSeconds: open.startedAtSeconds,
                  peakAtSeconds: open.peakAtSeconds,
                  endedAtSeconds: Math.min(
                    videoInfo.duration,
                    open.endedAtSeconds + interval,
                  ),
                  peakScore: open.peakScore,
                  meanScore: open.scoreSum / Math.max(1, open.samples),
                  samples: open.samples,
                });
              }
              open = null;
            }
          }
        }

        previous = current;
        const percent = Math.round(((index + 1) / sampleTimes.length) * 100);
        setProgress(percent);
        setStatus(
          `Mapeando localmente · ${percent}% · ${found.length}${open ? "+" : ""} candidatos`,
        );

        // Dá oportunidade para o navegador redesenhar a barra de progresso.
        if (index % 12 === 0) {
          await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        }
      }

      if (open) {
        found.push({
          id: `candidate-${found.length + 1}`,
          startedAtSeconds: open.startedAtSeconds,
          peakAtSeconds: open.peakAtSeconds,
          endedAtSeconds: Math.min(
            videoInfo.duration,
            Math.max(open.endedAtSeconds + interval, open.peakAtSeconds + interval),
          ),
          peakScore: open.peakScore,
          meanScore: open.scoreSum / Math.max(1, open.samples),
          samples: open.samples,
        });
      }

      const chronological = found
        .filter(
          (item) =>
            item.endedAtSeconds > item.startedAtSeconds &&
            Number.isFinite(item.peakScore),
        )
        .sort((left, right) => left.startedAtSeconds - right.startedAtSeconds)
        .slice(0, MAX_CANDIDATES_SHOWN);

      setCandidates(chronological);
      setProgress(100);
      setStatus(
        chronological.length
          ? `${chronological.length} possíveis acontecimentos encontrados. O vídeo original continua local.`
          : "Nenhuma mudança acima do limiar foi encontrada. Tente aumentar a sensibilidade.",
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Falha desconhecida ao percorrer o vídeo.",
      );
      setStatus("A leitura local foi interrompida.");
    } finally {
      setScanning(false);
    }
  }

  function eventBaseDate() {
    const parsed = Date.parse(startLocal);
    return Number.isFinite(parsed)
      ? parsed
      : Date.now() - (videoInfo?.duration ?? 0) * 1000;
  }

  function isoAt(seconds: number) {
    return new Date(eventBaseDate() + seconds * 1000).toISOString();
  }

  async function framesForCandidate(candidate: Candidate) {
    if (decoderMode === "compatibility") {
      const selectedFile = fileRef.current;
      if (!selectedFile) throw new Error("Arquivo local indisponível.");

      return extractCompatibilityFrames(
        selectedFile,
        candidate,
        isoAt,
        (message) => setStatus(message),
      );
    }

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    if (!video || !canvas) throw new Error("Prévia do vídeo indisponível.");

    const points: Array<{ label: FrameLabel; seconds: number }> = [
      { label: "start", seconds: candidate.startedAtSeconds },
      { label: "peak", seconds: candidate.peakAtSeconds },
      { label: "end", seconds: candidate.endedAtSeconds },
    ];

    const unique: Array<{ label: FrameLabel; seconds: number }> = [];
    for (const point of points) {
      if (
        !unique.some(
          (existing) => Math.abs(existing.seconds - point.seconds) < 0.35,
        )
      ) {
        unique.push(point);
      }
    }

    const frames: CapturedFrame[] = [];
    for (const point of unique) {
      const imageUrl = await captureJpeg(video, canvas, point.seconds);
      frames.push({
        label: point.label,
        capturedAt: isoAt(point.seconds),
        imageUrl,
      });
    }
    return frames;
  }

  async function analyzeCandidates() {
    if (!videoInfo || !candidates.length) return;

    setAnalyzing(true);
    setError(null);
    setAnalysis([]);

    const selected = [...candidates]
      .sort((left, right) => right.peakScore - left.peakScore)
      .slice(0, maxAiEvents)
      .sort((left, right) => left.startedAtSeconds - right.startedAtSeconds);

    const collected: AnalysisItem[] = [];

    try {
      for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index]!;
        setStatus(
          `IA · analisando ${index + 1} de ${selected.length} · ${formatDuration(candidate.peakAtSeconds)}`,
        );

        const frames = await framesForCandidate(candidate);
        const sentBytes = frames.reduce(
          (total, frame) => total + dataUrlBytes(frame.imageUrl),
          0,
        );

        const response = await fetch("/api/admin/video-lab/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startedAt: isoAt(candidate.startedAtSeconds),
            endedAt: isoAt(candidate.endedAtSeconds),
            environmentDescription: environment,
            monitoringGoal: goal,
            peakMotionPercent: candidate.peakScore,
            meanMotionPercent: candidate.meanScore,
            framesObserved: candidate.samples,
            frames,
          }),
        });

        const payload = (await response.json().catch(() => ({
          error: `HTTP ${response.status}`,
        }))) as AnalysisResponse;

        collected.push({
          candidate,
          response: payload,
          frameCount: frames.length,
          sentBytes,
        });
        setAnalysis([...collected]);

        if (!response.ok) {
          throw new Error(payload.error || `A IA respondeu HTTP ${response.status}.`);
        }
      }

      const totalSent = collected.reduce((sum, item) => sum + item.sentBytes, 0);
      setStatus(
        `${collected.length} acontecimentos analisados · ${formatBytes(totalSent)} de imagens enviados · 0 B de vídeo enviados.`,
      );
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Falha desconhecida durante a análise com IA.",
      );
      setStatus("A análise foi interrompida; os resultados já concluídos foram mantidos na tela.");
    } finally {
      setAnalyzing(false);
    }
  }

  function exportResults() {
    if (!videoInfo || !analysis.length) return;

    const payload = {
      schema: "monitoria-video-lab/1",
      generatedAt: new Date().toISOString(),
      source: {
        name: videoInfo.name,
        durationSeconds: videoInfo.duration,
        width: videoInfo.width,
        height: videoInfo.height,
        originalBytes: videoInfo.size,
        originalUploaded: false,
      },
      settings: {
        mode,
        sampleIntervalSeconds: modeConfig[mode].interval,
        sensitivity,
        thresholdPercent: threshold,
        environment,
        goal,
      },
      candidates,
      analysis,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `monitoria-video-lab-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const rankedForAi = useMemo(
    () =>
      [...candidates]
        .sort((left, right) => right.peakScore - left.peakScore)
        .slice(0, maxAiEvents)
        .map((item) => item.id),
    [candidates, maxAiEvents],
  );
  const aiSet = useMemo(() => new Set(rankedForAi), [rankedForAi]);

  const totalSent = analysis.reduce((sum, item) => sum + item.sentBytes, 0);
  const totalTokens = analysis.reduce(
    (sum, item) => sum + Number(item.response.usage?.totalTokens ?? 0),
    0,
  );
  const totalLatency = analysis.reduce(
    (sum, item) => sum + Number(item.response.latencyMs ?? 0),
    0,
  );

  return (
    <div className={styles.labGrid}>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>1 · ARQUIVO LOCAL</span>
            <h2>Escolha uma gravação de até 1 hora</h2>
            <p>O seletor não faz upload. O navegador abre o arquivo pelo próprio dispositivo.</p>
          </div>
          <strong className={styles.localBadge}>LOCAL</strong>
        </div>

        <label className={styles.dropzone}>
          <input
            type="file"
            accept="video/*,.mp4,.mov,.mkv,.avi,.webm,.m4v,.ts,.mts,.m2ts,.mpg,.mpeg,.3gp,.3g2,.ogv,.dav,.264,.h264,.265,.h265"
            disabled={scanning || analyzing || preparingCompatibility}
            onChange={(event) => onSelectFile(event.target.files?.[0] ?? null)}
          />
          <strong>{file ? file.name : "Selecionar vídeo"}</strong>
          <span>MP4, MOV, MKV, AVI, WebM, HEVC/H.265, MTS/M2TS, MPEG, 3GP e outros. Se o navegador não reproduzir, o MonitorIA lê os quadros diretamente no dispositivo.</span>
        </label>

        <video
          ref={videoRef}
          className={styles.preview}
          controls
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={onMetadataLoaded}
          onError={onVideoError}
        />

        {videoInfo ? (
          <div className={styles.fileMetrics}>
            <div>
              <span>Duração</span>
              <strong>
                {videoInfo.durationKnown
                  ? formatDuration(videoInfo.duration)
                  : "a inferir no mapeamento"}
              </strong>
            </div>
            <div>
              <span>Resolução</span>
              <strong>
                {videoInfo.width > 0 && videoInfo.height > 0
                  ? `${videoInfo.width}×${videoInfo.height}`
                  : "não informada pelo arquivo"}
              </strong>
            </div>
            <div><span>Arquivo original</span><strong>{formatBytes(videoInfo.size)}</strong></div>
            <div><span>Upload original</span><strong className={styles.good}>0 B</strong></div>
            <div><span>Leitura</span><strong>{decoderMode === "compatibility" ? "Compatibilidade local" : "Nativa"}</strong></div>
          </div>
        ) : null}
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <div>
            <span>2 · PRÉ-ANÁLISE</span>
            <h2>Mapeamento no navegador</h2>
            <p>A leitura usa miniaturas em memória. Em HEVC/H.265 e outros codecs não reproduzíveis pelo navegador, os quadros são extraídos localmente sem converter o vídeo inteiro.</p>
          </div>
        </div>

        <div className={styles.settingsGrid}>
          <label>
            <span>Modo de varredura</span>
            <select
              value={mode}
              disabled={scanning || analyzing}
              onChange={(event) => setMode(event.target.value as ScanMode)}
            >
              {Object.entries(modeConfig).map(([key, item]) => (
                <option value={key} key={key}>{item.label} · {item.interval}s</option>
              ))}
            </select>
            <small>{modeConfig[mode].description}</small>
          </label>

          <label>
            <span>Sensibilidade: {sensitivity}/10</span>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={sensitivity}
              disabled={scanning || analyzing}
              onChange={(event) => setSensitivity(Number(event.target.value))}
            />
            <small>Gatilho atual: aproximadamente {threshold.toFixed(1)}% do quadro mudando.</small>
          </label>

          <label>
            <span>Máximo de acontecimentos na IA</span>
            <select
              value={maxAiEvents}
              disabled={scanning || analyzing}
              onChange={(event) => setMaxAiEvents(Number(event.target.value))}
            >
              <option value={3}>3 · teste econômico</option>
              <option value={6}>6 · recomendado</option>
              <option value={12}>12 · amostra maior</option>
            </select>
            <small>Selecionamos os maiores picos sem enviar o restante do vídeo.</small>
          </label>

          <label>
            <span>Início aproximado da gravação</span>
            <input
              type="datetime-local"
              value={startLocal}
              disabled={scanning || analyzing}
              onChange={(event) => setStartLocal(event.target.value)}
            />
            <small>Serve apenas para reconstruir horários dos quadros.</small>
          </label>
        </div>

        <label className={styles.fullField}>
          <span>Contexto da câmera</span>
          <input
            value={environment}
            disabled={scanning || analyzing}
            maxLength={1200}
            onChange={(event) => setEnvironment(event.target.value)}
          />
        </label>

        <label className={styles.fullField}>
          <span>Objetivo da análise</span>
          <textarea
            value={goal}
            disabled={scanning || analyzing}
            maxLength={280}
            rows={3}
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!videoInfo || scanning || analyzing || preparingCompatibility || Boolean(error)}
            onClick={scanVideo}
          >
            {scanning ? "Mapeando..." : "Mapear acontecimentos localmente"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!candidates.length || scanning || analyzing}
            onClick={analyzeCandidates}
          >
            {analyzing ? "Analisando..." : `Analisar até ${Math.min(maxAiEvents, candidates.length)} com IA`}
          </button>
        </div>

        <div className={styles.progressTrack} aria-label="Progresso">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className={styles.status}>{status}</p>
        {error ? <div className={styles.errorBox}>{error}</div> : null}
      </section>

      {candidates.length ? (
        <section className={`${styles.panel} ${styles.fullWidth}`}>
          <div className={styles.panelHeading}>
            <div>
              <span>3 · CANDIDATOS LOCAIS</span>
              <h2>{candidates.length} possíveis acontecimentos</h2>
              <p>Os marcados como “IA” são os maiores picos que serão usados na próxima etapa.</p>
            </div>
          </div>

          <div className={styles.candidateList}>
            {candidates.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                className={styles.candidateRow}
                onClick={() => {
                  const video = videoRef.current;
                  if (decoderMode === "native" && video) {
                    void seekVideo(video, candidate.peakAtSeconds);
                  }
                }}
              >
                <span className={styles.timeCode}>{formatDuration(candidate.peakAtSeconds)}</span>
                <span className={styles.candidateDescription}>
                  <strong>{formatDuration(candidate.startedAtSeconds)} → {formatDuration(candidate.endedAtSeconds)}</strong>
                  <small>pico {candidate.peakScore.toFixed(1)}% · média {candidate.meanScore.toFixed(1)}%</small>
                </span>
                {aiSet.has(candidate.id) ? <em>IA</em> : <em className={styles.localOnly}>LOCAL</em>}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {analysis.length ? (
        <section className={`${styles.panel} ${styles.fullWidth}`}>
          <div className={styles.panelHeading}>
            <div>
              <span>4 · RESULTADO DA IA</span>
              <h2>Análise dos quadros selecionados</h2>
              <p>Nenhum MP4 foi enviado ou persistido pelo laboratório.</p>
            </div>
            <button type="button" className={styles.exportButton} onClick={exportResults}>
              Exportar JSON
            </button>
          </div>

          <div className={styles.runMetrics}>
            <div><span>Resultados</span><strong>{analysis.length}</strong></div>
            <div><span>Imagens enviadas</span><strong>{formatBytes(totalSent)}</strong></div>
            <div><span>Vídeo enviado</span><strong className={styles.good}>0 B</strong></div>
            <div><span>Tokens</span><strong>{totalTokens.toLocaleString("pt-BR")}</strong></div>
            <div><span>Latência IA</span><strong>{(totalLatency / 1000).toFixed(1)}s</strong></div>
          </div>

          <div className={styles.resultsList}>
            {analysis.map((item) => {
              const confidence = Number(item.response.event?.confidence ?? 0);
              return (
                <article className={styles.resultCard} key={item.candidate.id}>
                  <header>
                    <div>
                      <span>{formatDuration(item.candidate.peakAtSeconds)}</span>
                      <h3>{resultTitle(item.response)}</h3>
                    </div>
                    <strong>{Math.round(confidence * 100)}%</strong>
                  </header>
                  <p>{String(item.response.event?.summary ?? item.response.error ?? "Sem resumo retornado.")}</p>
                  <dl>
                    <div><dt>Tipo</dt><dd>{String(item.response.event?.primaryEventType ?? "—")}</dd></div>
                    <div><dt>Revisão</dt><dd>{item.response.event?.requiresReview ? "Sim" : "Não"}</dd></div>
                    <div><dt>Modelo</dt><dd>{item.response.model ?? "—"}</dd></div>
                    <div><dt>Quadros</dt><dd>{item.frameCount}</dd></div>
                    <div><dt>Enviado</dt><dd>{formatBytes(item.sentBytes)}</dd></div>
                    <div><dt>Latência</dt><dd>{((item.response.latencyMs ?? 0) / 1000).toFixed(1)}s</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <canvas ref={detectionCanvasRef} className={styles.hiddenCanvas} />
      <canvas ref={captureCanvasRef} className={styles.hiddenCanvas} />
    </div>
  );
}
