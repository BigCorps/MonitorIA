"use client";

type BrowserFfmpeg = {
  load(input: { coreURL: string; wasmURL: string }): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  ffprobe(args: string[]): Promise<number>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  readFile(path: string): Promise<string | Uint8Array>;
  deleteFile(path: string): Promise<boolean>;
  listDir(path: string): Promise<Array<{ name: string; isDir: boolean }>>;
  createDir(path: string): Promise<boolean>;
  mount(
    fsType: unknown,
    options: Record<string, unknown>,
    mountPoint: string,
  ): Promise<boolean>;
  unmount(mountPoint: string): Promise<boolean>;
  on(
    event: "log" | "progress",
    callback: (payload: any) => void,
  ): void;
  terminate(): void;
};

type Runtime = {
  ffmpeg: BrowserFfmpeg;
  inputPath: string;
  mode: "workerfs" | "memory";
  logs: string[];
  unmount: () => Promise<void>;
};

const WRAPPER_URL = "/vendor/ffmpeg/index.js";
const FFMPEG_CORE_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      navigator.maxTouchPoints > 1)
  );
}

export function recordingBrowserMetadata() {
  if (typeof navigator === "undefined") return {};
  const ua = navigator.userAgent;
  return {
    userAgent: ua.slice(0, 500),
    platform: String(navigator.platform ?? "").slice(0, 120),
    maxTouchPoints: Number(navigator.maxTouchPoints ?? 0),
    hardwareConcurrency: Number(navigator.hardwareConcurrency ?? 0),
    deviceMemory:
      "deviceMemory" in navigator
        ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0)
        : null,
    ios: isAppleMobile(),
    safari:
      /Safari/i.test(ua) &&
      !/Chrome|CriOS|Edg|OPR|Android/i.test(ua),
    wasm: typeof WebAssembly !== "undefined",
    createImageBitmap: typeof createImageBitmap === "function",
  };
}

async function loadBrowserModule() {
  const nativeImport = new Function(
    "url",
    "return import(url)",
  ) as (url: string) => Promise<any>;

  return nativeImport(WRAPPER_URL);
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function createRecordingFfmpegRuntime(
  file: File,
  onProgress?: (value: number) => void,
): Promise<Runtime> {
  const module = await loadBrowserModule();
  const ffmpeg = new module.FFmpeg() as BrowserFfmpeg;
  const logs: string[] = [];

  ffmpeg.on("log", ({ message }: { message?: string }) => {
    if (!message) return;
    logs.push(String(message));
    if (logs.length > 100) logs.splice(0, logs.length - 100);
  });

  if (onProgress) {
    ffmpeg.on(
      "progress",
      ({ progress }: { progress?: number }) => {
        if (!Number.isFinite(progress)) return;
        onProgress(
          Math.max(0, Math.min(100, Math.round(Number(progress) * 100))),
        );
      },
    );
  }

  const temporaryUrls: string[] = [];
  const remoteAssetAsBlobUrl = async (url: string, mimeType: string) => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) {
      throw new Error(
        `Não foi possível carregar o decodificador local (HTTP ${response.status}).`,
      );
    }
    const bytes = await response.arrayBuffer();
    const objectUrl = URL.createObjectURL(
      new Blob([bytes], { type: mimeType }),
    );
    temporaryUrls.push(objectUrl);
    return objectUrl;
  };

  try {
    const coreURL = await remoteAssetAsBlobUrl(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
      "text/javascript",
    );
    const wasmURL = await remoteAssetAsBlobUrl(
      `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
      "application/wasm",
    );
    await ffmpeg.load({ coreURL, wasmURL });
  } catch (error) {
    for (const url of temporaryUrls) URL.revokeObjectURL(url);
    throw new Error(
      `Não foi possível iniciar o modo de compatibilidade do navegador: ${errorText(error)}`,
    );
  }

  const mountPoint = "/recording";
  await ffmpeg.createDir(mountPoint).catch(() => undefined);

  try {
    await ffmpeg.mount(
      module.FFFSType.WORKERFS,
      { files: [file] },
      mountPoint,
    );

    return {
      ffmpeg,
      inputPath: `${mountPoint}/${file.name}`,
      mode: "workerfs",
      logs,
      unmount: async () => {
        await ffmpeg.unmount(mountPoint).catch(() => undefined);
        for (const url of temporaryUrls) URL.revokeObjectURL(url);
      },
    };
  } catch {
    const memoryLimit = isAppleMobile()
      ? 180 * 1024 * 1024
      : 350 * 1024 * 1024;

    if (file.size > memoryLimit) {
      ffmpeg.terminate();
      for (const url of temporaryUrls) URL.revokeObjectURL(url);
      throw new Error(
        isAppleMobile()
          ? "Este arquivo precisa do acesso local direto para ser processado neste iPhone/iPad. O navegador não liberou esse modo e o arquivo é grande demais para a cópia segura em memória."
          : "O navegador não liberou o acesso local direto e o arquivo é grande demais para a cópia segura em memória.",
      );
    }

    try {
      await ffmpeg.writeFile(
        "/recording-input",
        new Uint8Array(await file.arrayBuffer()),
      );
    } catch (error) {
      ffmpeg.terminate();
      for (const url of temporaryUrls) URL.revokeObjectURL(url);
      throw new Error(
        `Não foi possível preparar o arquivo local: ${errorText(error)}`,
      );
    }

    return {
      ffmpeg,
      inputPath: "/recording-input",
      mode: "memory",
      logs,
      unmount: async () => {
        await ffmpeg.deleteFile("/recording-input").catch(() => undefined);
        for (const url of temporaryUrls) URL.revokeObjectURL(url);
      },
    };
  }
}

export async function closeRecordingFfmpegRuntime(runtime: Runtime) {
  await runtime.unmount().catch(() => undefined);
  runtime.ffmpeg.terminate();
}

function parseDuration(logs: string[]) {
  const joined = logs.join("\n");
  const match = joined.match(
    /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i,
  );
  if (!match) return null;
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3])
  );
}

function parseResolution(logs: string[]) {
  const joined = logs.join("\n");
  const matches = [...joined.matchAll(/(\d{2,5})x(\d{2,5})/g)];
  for (const match of matches) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width >= 64 && height >= 64) return { width, height };
  }
  return { width: null, height: null };
}

function parseCodec(logs: string[]) {
  const joined = logs.join("\n");
  const match = joined.match(/Video:\s*([^,\s]+)/i);
  return match?.[1] ? String(match[1]).toLowerCase() : null;
}

export async function inspectRecordingWithFfmpeg(file: File) {
  const runtime = await createRecordingFfmpegRuntime(file);
  try {
    const jsonPath = "/probe.json";
    runtime.logs.length = 0;

    let duration: number | null = null;
    let width: number | null = null;
    let height: number | null = null;
    let codec: string | null = null;

    try {
      const code = await runtime.ffmpeg.ffprobe([
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        runtime.inputPath,
        "-o",
        jsonPath,
      ]);

      if (code === 0) {
        const raw = await runtime.ffmpeg.readFile(jsonPath);
        const text =
          typeof raw === "string"
            ? raw
            : new TextDecoder().decode(raw);
        const parsed = JSON.parse(text) as {
          format?: { duration?: string | number };
          streams?: Array<Record<string, unknown>>;
        };
        const stream = (parsed.streams ?? []).find(
          (item) => item.codec_type === "video",
        );
        duration = Number(parsed.format?.duration ?? stream?.duration);
        width = Number(stream?.width) || null;
        height = Number(stream?.height) || null;
        codec = stream?.codec_name ? String(stream.codec_name) : null;
      }
    } catch {
      // ffprobe pode não obter duração em exports crus de DVR.
    } finally {
      await runtime.ffmpeg.deleteFile(jsonPath).catch(() => undefined);
    }

    if (
      !Number.isFinite(duration) ||
      Number(duration) <= 0 ||
      !width ||
      !height ||
      !codec
    ) {
      runtime.logs.length = 0;
      await runtime.ffmpeg.exec([
        "-hide_banner",
        "-loglevel",
        "info",
        "-probesize",
        "100M",
        "-analyzeduration",
        "100M",
        "-err_detect",
        "ignore_err",
        "-i",
        runtime.inputPath,
      ]).catch(() => undefined);

      duration =
        Number.isFinite(duration) && Number(duration) > 0
          ? duration
          : parseDuration(runtime.logs);
      const parsedResolution = parseResolution(runtime.logs);
      width = width ?? parsedResolution.width;
      height = height ?? parsedResolution.height;
      codec = codec ?? parseCodec(runtime.logs);
    }

    return {
      durationSeconds:
        Number.isFinite(duration) && Number(duration) > 0
          ? Number(duration)
          : 3600,
      durationKnown:
        Number.isFinite(duration) && Number(duration) > 0,
      width,
      height,
      codec,
      runtimeMode: runtime.mode,
    };
  } finally {
    await closeRecordingFfmpegRuntime(runtime);
  }
}

export async function extractFirstFrameWithFfmpeg(
  file: File,
  maxWidth = 1280,
) {
  const runtime = await createRecordingFfmpegRuntime(file);
  const output = "/first-valid.jpg";

  try {
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
      "-map",
      "0:v:0",
      "-frames:v",
      "1",
      "-vf",
      `scale=w='min(${maxWidth},iw)':h=-2:flags=fast_bilinear`,
      "-q:v",
      "4",
      "-an",
      "-sn",
      "-dn",
      output,
    ]);

    const raw = await runtime.ffmpeg.readFile(output).catch(() => null);
    if (
      code !== 0 ||
      !raw ||
      typeof raw === "string" ||
      !raw.byteLength
    ) {
      throw new Error(
        `Não foi possível extrair a primeira imagem válida. ${runtime.logs
          .slice(-8)
          .join(" | ")}`.trim(),
      );
    }

    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Blob([copy.buffer], { type: "image/jpeg" });
  } finally {
    await runtime.ffmpeg.deleteFile(output).catch(() => undefined);
    await closeRecordingFfmpegRuntime(runtime);
  }
}

export async function scanRecordingWithFfmpeg(input: {
  file: File;
  intervalSeconds: number;
  durationSeconds: number;
  startSeconds?: number;
  onProgress?: (value: number) => void;
  onSample: (
    index: number,
    offsetSeconds: number,
    jpeg: Uint8Array,
  ) => Promise<void>;
}) {
  const runtime = await createRecordingFfmpegRuntime(
    input.file,
    (value) => input.onProgress?.(Math.min(85, Math.round(value * 0.85))),
  );
  const outputPattern = "/recording-sample-%06d.jpg";
  const paths: string[] = [];

  try {
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
      ...(input.startSeconds && input.startSeconds > 0
        ? ["-ss", String(input.startSeconds)]
        : []),
      "-i",
      runtime.inputPath,
      "-t",
      String(Math.min(3600, input.durationSeconds)),
      "-map",
      "0:v:0",
      "-vf",
      `fps=1/${input.intervalSeconds},scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:black`,
      "-q:v",
      "6",
      "-an",
      "-sn",
      "-dn",
      "-start_number",
      "0",
      outputPattern,
    ]);

    const entries = await runtime.ffmpeg.listDir("/");
    const numbered = entries
      .filter(
        (entry) =>
          !entry.isDir &&
          /^recording-sample-\d+\.jpg$/.test(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        index: Number(entry.name.match(/(\d+)\.jpg$/)?.[1] ?? 0),
      }))
      .sort((a, b) => a.index - b.index);

    for (const entry of numbered) paths.push(`/${entry.name}`);

    if (code !== 0 || paths.length < 2) {
      throw new Error(
        `O modo de compatibilidade não conseguiu mapear esta gravação. ${runtime.logs
          .slice(-8)
          .join(" | ")}`.trim(),
      );
    }

    for (let index = 0; index < paths.length; index += 1) {
      const path = paths[index]!;
      const raw = await runtime.ffmpeg.readFile(path);
      if (typeof raw === "string" || !raw.byteLength) continue;

      await input.onSample(
        index,
        Math.min(
          input.durationSeconds,
          (input.startSeconds ?? 0) + index * input.intervalSeconds,
        ),
        raw,
      );

      await runtime.ffmpeg.deleteFile(path).catch(() => undefined);

      if (index % 12 === 0 || index === paths.length - 1) {
        input.onProgress?.(
          85 +
            Math.round(
              ((index + 1) / Math.max(1, paths.length)) * 15,
            ),
        );
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, 0),
        );
      }
    }

    return paths.length;
  } finally {
    for (const path of paths) {
      await runtime.ffmpeg.deleteFile(path).catch(() => undefined);
    }
    await closeRecordingFfmpegRuntime(runtime);
  }
}

export async function extractRecordingClipWithFfmpeg(input: {
  file: File;
  offsetSeconds: number;
  durationSeconds: number;
  onProgress?: (value: number) => void;
}) {
  const runtime = await createRecordingFfmpegRuntime(
    input.file,
    input.onProgress,
  );
  const output = "/recording-evidence.mp4";

  try {
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
      "-ss",
      String(Math.max(0, input.offsetSeconds)),
      "-t",
      String(Math.max(1, input.durationSeconds)),
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "copy",
      "-movflags",
      "+faststart",
      output,
    ]);

    const raw = await runtime.ffmpeg.readFile(output).catch(() => null);
    if (
      code !== 0 ||
      !raw ||
      typeof raw === "string" ||
      !raw.byteLength
    ) {
      throw new Error(
        `Não foi possível preparar o clipe local desta gravação. ${runtime.logs
          .slice(-8)
          .join(" | ")}`.trim(),
      );
    }

    const copy = new Uint8Array(raw.byteLength);
    copy.set(raw);
    return new Blob([copy.buffer], { type: "video/mp4" });
  } finally {
    await runtime.ffmpeg.deleteFile(output).catch(() => undefined);
    await closeRecordingFfmpegRuntime(runtime);
  }
}
