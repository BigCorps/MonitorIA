"use client";

import {
  RECORDING_MOTION_HEIGHT,
  RECORDING_MOTION_WIDTH,
} from "./browser-motion";
import {
  RecordingEventDetector,
  type RecordingCaptureRequest,
} from "./browser-detector";
import {
  extractFirstFrameWithFfmpeg,
  inspectRecordingWithFfmpeg,
  scanRecordingWithFfmpeg,
} from "./browser-ffmpeg";
import type {
  RecordingCameraConfig,
  RecordingEvidenceFrame,
  RecordingPreparedEvent,
  RecordingScanResult,
  RecordingVideoInfo,
} from "./types";

const MAX_VIDEO_SECONDS = 3600;

function waitForEvent(
  target: EventTarget,
  success: string,
  failure: string,
  timeoutMs = 12_000,
) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Tempo excedido ao ler a gravação."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(success, onSuccess);
      target.removeEventListener(failure, onFailure);
    };

    const onSuccess = () => {
      cleanup();
      resolve();
    };
    const onFailure = () => {
      cleanup();
      reject(new Error("O navegador não conseguiu reproduzir este codec."));
    };

    target.addEventListener(success, onSuccess, { once: true });
    target.addEventListener(failure, onFailure, { once: true });
  });
}

function seek(video: HTMLVideoElement, seconds: number) {
  const target = Math.max(
    0,
    Math.min(
      Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.01) : seconds,
      seconds,
    ),
  );

  if (Math.abs(video.currentTime - target) < 0.01) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("A busca por um quadro demorou demais."));
    }, 8000);

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
      reject(new Error("O navegador falhou ao buscar um quadro."));
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });

    try {
      video.currentTime = target;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);

  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const x = Math.round((width - drawWidth) / 2);
  const y = Math.round((height - drawHeight) / 2);
  context.drawImage(source, x, y, drawWidth, drawHeight);
}

function lumaFromCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
) {
  canvas.width = RECORDING_MOTION_WIDTH;
  canvas.height = RECORDING_MOTION_HEIGHT;

  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas indisponível.");

  drawContained(
    context,
    video,
    Math.max(1, video.videoWidth),
    Math.max(1, video.videoHeight),
    canvas.width,
    canvas.height,
  );

  const pixels = context.getImageData(
    0,
    0,
    canvas.width,
    canvas.height,
  ).data;
  const result = new Uint8Array(canvas.width * canvas.height);

  for (
    let sourceIndex = 0, targetIndex = 0;
    sourceIndex < pixels.length;
    sourceIndex += 4, targetIndex += 1
  ) {
    result[targetIndex] = Math.round(
      (
        pixels[sourceIndex]! * 3 +
        pixels[sourceIndex + 1]! * 6 +
        pixels[sourceIndex + 2]!
      ) / 10,
    );
  }
  return result;
}

function planEvidenceWidth(planCode: string) {
  return planCode === "intensive" ? 1280 : 960;
}

function planEvidenceQuality(planCode: string) {
  return planCode === "intensive" ? 0.82 : 0.76;
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Não foi possível preparar o JPEG.")),
      "image/jpeg",
      quality,
    );
  });
}

async function captureNativeEvidence(
  video: HTMLVideoElement,
  planCode: string,
  label: RecordingEvidenceFrame["label"],
  offsetSeconds: number,
  capturedAt: string,
) {
  const maxWidth = planEvidenceWidth(planCode);
  const sourceWidth = Math.max(1, video.videoWidth);
  const sourceHeight = Math.max(1, video.videoHeight);
  const width = Math.min(maxWidth, sourceWidth);
  const height = Math.max(2, Math.round((sourceHeight / sourceWidth) * width));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas indisponível.");

  context.drawImage(video, 0, 0, width, height);
  const blob = await canvasBlob(canvas, planEvidenceQuality(planCode));
  const imageUrl = await blobToDataUrl(blob);

  return {
    label,
    offsetSeconds,
    capturedAt,
    imageUrl,
    width,
    height,
    byteSize: blob.size,
  } satisfies RecordingEvidenceFrame;
}

async function jpegToLuma(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: "image/jpeg" });
  const canvas = document.createElement("canvas");
  canvas.width = RECORDING_MOTION_WIDTH;
  canvas.height = RECORDING_MOTION_HEIGHT;
  const context = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });
  if (!context) throw new Error("Canvas indisponível.");

  let source: CanvasImageSource;
  let cleanup = () => {};

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    source = bitmap;
    cleanup = () => bitmap.close();
  } else {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    source = image;
    cleanup = () => URL.revokeObjectURL(url);
  }

  try {
    drawContained(
      context,
      source,
      320,
      180,
      canvas.width,
      canvas.height,
    );
    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
    const result = new Uint8Array(canvas.width * canvas.height);

    for (
      let sourceIndex = 0, targetIndex = 0;
      sourceIndex < pixels.length;
      sourceIndex += 4, targetIndex += 1
    ) {
      result[targetIndex] = Math.round(
        (
          pixels[sourceIndex]! * 3 +
          pixels[sourceIndex + 1]! * 6 +
          pixels[sourceIndex + 2]!
        ) / 10,
      );
    }

    return result;
  } finally {
    cleanup();
  }
}

export function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("Não foi possível ler a imagem local."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(blob);
  });
}

function bytesToDataUrl(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return blobToDataUrl(
    new Blob([copy.buffer], { type: "image/jpeg" }),
  );
}

function isoAt(sourceStartedAt: Date, offsetSeconds: number) {
  return new Date(
    sourceStartedAt.getTime() + offsetSeconds * 1000,
  ).toISOString();
}

function evidenceKey(request: RecordingCaptureRequest) {
  return `${request.eventId}:${request.label}`;
}

export async function probeRecording(
  file: File,
  video: HTMLVideoElement,
): Promise<RecordingVideoInfo> {
  if (
    video.readyState >= 1 &&
    Number.isFinite(video.duration) &&
    video.duration > 0 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return {
      durationSeconds: video.duration,
      durationKnown: true,
      width: video.videoWidth,
      height: video.videoHeight,
      codec: null,
      decoderMode: "native",
      nativePreview: true,
    };
  }

  const inspected = await inspectRecordingWithFfmpeg(file);
  return {
    durationSeconds: inspected.durationSeconds,
    durationKnown: inspected.durationKnown,
    width: inspected.width,
    height: inspected.height,
    codec: inspected.codec,
    decoderMode: "compatibility",
    nativePreview: false,
  };
}

export async function extractFirstValidFrame(input: {
  file: File;
  video: HTMLVideoElement;
  info: RecordingVideoInfo;
}) {
  if (input.info.decoderMode === "native") {
    const candidates = [0.05, 0.25, 0.5, 1, 2, 3, 5].filter(
      (value) => value < input.info.durationSeconds,
    );

    for (const seconds of candidates.length ? candidates : [0]) {
      try {
        await seek(input.video, seconds);
        const frame = await captureNativeEvidence(
          input.video,
          "intensive",
          "start",
          seconds,
          new Date().toISOString(),
        );
        const response = await fetch(frame.imageUrl);
        return {
          blob: await response.blob(),
          offsetSeconds: seconds,
          width: frame.width,
          height: frame.height,
        };
      } catch {
        // tenta o próximo quadro antes de cair no FFmpeg
      }
    }
  }

  const blob = await extractFirstFrameWithFfmpeg(input.file, 1280);
  return {
    blob,
    offsetSeconds: 0,
    width: input.info.width,
    height: input.info.height,
  };
}

export async function ensureNativePreview(
  video: HTMLVideoElement,
  objectUrl: string,
) {
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = objectUrl;
  video.load();

  if (video.readyState >= 1) return true;

  try {
    await waitForEvent(video, "loadedmetadata", "error");
    return (
      Number.isFinite(video.duration) &&
      video.duration > 0 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    );
  } catch {
    return false;
  }
}

export async function scanRecording(input: {
  file: File;
  video: HTMLVideoElement;
  info: RecordingVideoInfo;
  sourceStartedAt: Date;
  config: RecordingCameraConfig;
  maxDurationSeconds?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number, message: string) => void;
}): Promise<RecordingScanResult> {
  const started = performance.now();
  const detector = new RecordingEventDetector(
    input.config,
    input.sourceStartedAt,
  );
  const evidence = new Map<string, RecordingEvidenceFrame>();
  const closed = new Map<string, RecordingPreparedEvent>();
  let compatibilitySampleCount: number | null = null;
  const interval = Math.max(
    0.2,
    Math.min(60, Number(input.config.captureIntervalSeconds || 1)),
  );
  const scanDuration = Math.max(
    interval,
    Math.min(
      MAX_VIDEO_SECONDS,
      Number(input.maxDurationSeconds ?? MAX_VIDEO_SECONDS),
      input.info.durationKnown
        ? input.info.durationSeconds
        : MAX_VIDEO_SECONDS,
    ),
  );

  const commitStep = async (
    step: ReturnType<RecordingEventDetector["observe"]>,
    captureFrame: (
      request: RecordingCaptureRequest,
    ) => Promise<RecordingEvidenceFrame>,
  ) => {
    for (const request of step.capture) {
      evidence.set(evidenceKey(request), await captureFrame(request));
    }

    for (const candidate of step.closed) {
      const frames = candidate.evidence.flatMap((request) => {
        const frame = evidence.get(
          `${candidate.eventId}:${request.label}`,
        );
        return frame ? [frame] : [];
      });

      if (!frames.length) continue;

      closed.set(candidate.eventId, {
        ...candidate,
        frames,
      });
    }
  };

  if (input.info.decoderMode === "native") {
    const canvas = document.createElement("canvas");
    const totalSamples = Math.max(
      2,
      Math.ceil(scanDuration / interval),
    );

    for (let index = 0; index < totalSamples; index += 1) {
      if (input.signal?.aborted) throw new Error("analysis_cancelled");

      const offset = Math.min(
        scanDuration,
        index * interval,
      );
      await seek(input.video, offset);
      const luma = lumaFromCanvas(input.video, canvas);
      const capturedAt = isoAt(input.sourceStartedAt, offset);
      const step = detector.observe({
        luma,
        offsetSeconds: offset,
        capturedAt,
      });

      await commitStep(step, async (request) =>
        captureNativeEvidence(
          input.video,
          input.config.planCode,
          request.label,
          request.offsetSeconds,
          isoAt(input.sourceStartedAt, request.offsetSeconds),
        ),
      );

      if (index % 4 === 0 || index === totalSamples - 1) {
        const progress = Math.round(
          ((index + 1) / totalSamples) * 100,
        );
        input.onProgress?.(
          progress,
          `Mapeando acontecimentos · ${progress}%`,
        );
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, 0),
        );
      }
    }

    const finalStep = detector.finish();
    await commitStep(finalStep, async (request) => {
      await seek(input.video, request.offsetSeconds);
      return captureNativeEvidence(
        input.video,
        input.config.planCode,
        request.label,
        request.offsetSeconds,
        isoAt(input.sourceStartedAt, request.offsetSeconds),
      );
    });
  } else {
    let lastJpeg: Uint8Array | null = null;
    let lastOffset = 0;

    compatibilitySampleCount = await scanRecordingWithFfmpeg({
      file: input.file,
      intervalSeconds: interval,
      durationSeconds: scanDuration,
      onProgress: (value) =>
        input.onProgress?.(
          value,
          `Modo compatibilidade · ${value}%`,
        ),
      onSample: async (_index, offset, jpeg) => {
        if (input.signal?.aborted) throw new Error("analysis_cancelled");

        lastJpeg = jpeg;
        lastOffset = offset;
        const luma = await jpegToLuma(jpeg);
        const capturedAt = isoAt(input.sourceStartedAt, offset);
        const step = detector.observe({
          luma,
          offsetSeconds: offset,
          capturedAt,
        });

        await commitStep(step, async (request) => ({
          label: request.label,
          offsetSeconds: request.offsetSeconds,
          capturedAt: isoAt(
            input.sourceStartedAt,
            request.offsetSeconds,
          ),
          imageUrl: await bytesToDataUrl(jpeg),
          width: 320,
          height: 180,
          byteSize: jpeg.byteLength,
        }));
      },
    });

    const finalStep = detector.finish();
    if (lastJpeg) {
      const finalBytes = lastJpeg as Uint8Array;
      await commitStep(finalStep, async (request) => ({
        label: request.label,
        offsetSeconds: request.offsetSeconds,
        capturedAt: isoAt(
          input.sourceStartedAt,
          request.offsetSeconds,
        ),
        imageUrl: await bytesToDataUrl(finalBytes),
        width: 320,
        height: 180,
        byteSize: finalBytes.byteLength,
      }));
    }
  }

  const actualDuration =
    input.info.decoderMode === "compatibility" &&
    !input.info.durationKnown
      ? Math.min(
          scanDuration,
          Math.max(
            interval,
            (compatibilitySampleCount ?? 1) * interval,
          ),
        )
      : scanDuration;

  return {
    durationSeconds: actualDuration,
    candidates: [...closed.values()].sort(
      (a, b) => a.startedAtSeconds - b.startedAtSeconds,
    ),
    mappingMs: Math.round(performance.now() - started),
    decoderMode: input.info.decoderMode,
  };
}

export function dataUrlBase64(value: string) {
  const separator = value.indexOf(",");
  return separator >= 0 ? value.slice(separator + 1) : value;
}
