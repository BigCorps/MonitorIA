import {
  spawn,
  type ChildProcess,
} from "node:child_process";
import {
  mkdir,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePaths } from "./paths.js";
import type { ClipUploadRequest } from "./types.js";

const KEEP_BUFFER_MS = 120_000;
const MAX_BUFFER_BYTES = 512 * 1024 * 1024;
const SEGMENT_SECONDS = 3;
const MIN_TS_SEGMENT_BYTES = 188;

type Segment = {
  path: string;
  modifiedAt: number;
  bytes: number;
};

type RunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type EncoderProfile = {
  name: string;
  args: string[];
};

export type BuiltClip = {
  path: string;
  byteSize: number;
  durationSeconds: number;
  generationMs: number;
  cpuTimeMs: number;
  segmentsUsed: number;
};

function safeCameraId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function run(
  executable: string,
  args: string[],
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

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
        reject(new Error("A operação do FFmpeg excedeu o limite."));
        return;
      }
      resolve({
        code: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

function concatPath(value: string) {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function encoderProfiles(output: string): EncoderProfile[] {
  const available = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*[VAS\.]{6}\s+([^\s]+)/);
    if (match?.[1]) available.add(match[1]);
  }

  const profiles: EncoderProfile[] = [];

  // Media Foundation faz parte do FFmpeg no Windows e pode operar por
  // software ou hardware. É a primeira escolha porque permanece compatível
  // com a build LGPL distribuída pelo MonitorIA.
  if (available.has("h264_mf")) {
    profiles.push({
      name: "h264_mf",
      args: [
        "-c:v",
        "h264_mf",
        "-pix_fmt",
        "nv12",
        "-b:v",
        "2500k",
        "-maxrate",
        "3500k",
        "-bufsize",
        "5000k",
      ],
    });
  }

  // Mantidos como alternativas quando presentes em outra distribuição.
  if (available.has("libopenh264")) {
    profiles.push({
      name: "libopenh264",
      args: [
        "-c:v",
        "libopenh264",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        "2500k",
      ],
    });
  }

  if (available.has("libx264")) {
    profiles.push({
      name: "libx264",
      args: [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
      ],
    });
  }

  return profiles;
}

export class CircularClipBuffer {
  private process: ChildProcess | null = null;
  private directory = "";
  private stopped = false;
  private pruneTimer: NodeJS.Timeout | null = null;
  private restartTimer: NodeJS.Timeout | null = null;
  private encoders: EncoderProfile[] | null = null;

  constructor(
    private readonly options: {
      cameraId: string;
      cameraName: string;
      ffmpegPath: string;
      rtspUrl: string;
      log: (message: string) => void;
    },
  ) {}

  async start() {
    if (this.process || this.stopped) return;

    const layout = await resolvePaths();
    this.directory = path.join(
      layout.root,
      "clip-buffer",
      safeCameraId(this.options.cameraId),
    );
    await mkdir(this.directory, { recursive: true });
    await this.prune();

    this.spawnBuffer();
    this.pruneTimer = setInterval(
      () => void this.prune(),
      15_000,
    );

    // Descobre o encoder já no início para que o log mostre claramente a
    // capacidade da máquina antes do primeiro acontecimento.
    try {
      await this.resolveEncoders();
    } catch (error) {
      this.options.log(
        `Buffer iniciado, mas nenhum encoder H.264 compatível foi detectado: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.options.log(
      `Buffer circular de clipes iniciado em "${this.options.cameraName}".`,
    );
  }

  private spawnBuffer() {
    if (this.stopped) return;

    const prefix = `${Date.now()}-%06d.ts`;
    const output = path.join(this.directory, prefix);
    const child = spawn(
      this.options.ffmpegPath,
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-rtsp_transport",
        "tcp",
        "-i",
        this.options.rtspUrl,
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "copy",
        "-f",
        "segment",
        "-segment_time",
        String(SEGMENT_SECONDS),
        "-segment_format",
        "mpegts",
        "-reset_timestamps",
        "1",
        "-y",
        output,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      },
    );

    this.process = child;
    let lastError = "";

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      lastError = String(chunk)
        .replace(/rtsp:\/\/[^\s'"]+/gi, "[RTSP ocultado]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(-500);
    });

    child.on("error", (error) => {
      lastError = error.message;
    });

    child.on("close", () => {
      if (this.process === child) this.process = null;
      if (this.stopped) return;

      this.options.log(
        `Buffer de "${this.options.cameraName}" foi interrompido${
          lastError ? `: ${lastError}` : "."
        } Reiniciando em 5 segundos.`,
      );
      this.restartTimer = setTimeout(
        () => this.spawnBuffer(),
        5_000,
      );
    });
  }

  private async resolveEncoders() {
    if (this.encoders) return this.encoders;

    const result = await run(
      this.options.ffmpegPath,
      ["-hide_banner", "-encoders"],
      30_000,
    );

    if (result.code !== 0) {
      throw new Error(
        result.stderr.replace(/\s+/g, " ").trim().slice(0, 500) ||
          `FFmpeg encerrou com código ${result.code}.`,
      );
    }

    const profiles = encoderProfiles(
      `${result.stdout}\n${result.stderr}`,
    );

    if (!profiles.length) {
      throw new Error(
        "Nenhum dos encoders h264_mf, libopenh264 ou libx264 está disponível.",
      );
    }

    this.encoders = profiles;
    this.options.log(
      `Encoder(es) H.264 disponível(is): ${profiles
        .map((profile) => profile.name)
        .join(", ")}.`,
    );

    return profiles;
  }

  private async segments(): Promise<Segment[]> {
    if (!this.directory) return [];

    const entries = await readdir(this.directory, {
      withFileTypes: true,
    });
    const result: Segment[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        continue;
      }

      const full = path.join(this.directory, entry.name);
      try {
        const item = await stat(full);

        // O arquivo atualmente aberto pelo segment muxer pode aparecer com
        // zero bytes por alguns instantes. Nunca o inclui no concat.
        if (item.size < MIN_TS_SEGMENT_BYTES) continue;

        result.push({
          path: full,
          modifiedAt: item.mtimeMs,
          bytes: item.size,
        });
      } catch {
        // Segmento ainda sendo finalizado.
      }
    }

    return result.sort(
      (left, right) => left.modifiedAt - right.modifiedAt,
    );
  }

  async prune() {
    const segments = await this.segments();
    const now = Date.now();
    let total = segments.reduce(
      (sum, item) => sum + item.bytes,
      0,
    );

    for (const segment of segments) {
      const expired =
        now - segment.modifiedAt > KEEP_BUFFER_MS;
      const oversized = total > MAX_BUFFER_BYTES;

      if (!expired && !oversized) continue;

      await rm(segment.path, { force: true });
      total -= segment.bytes;
    }
  }

  async buildClip(
    request: ClipUploadRequest,
  ): Promise<BuiltClip> {
    const started = Date.now();
    const cpuStarted = process.cpuUsage();
    await this.prune();

    const requestedStart = Date.parse(request.clipStartsAt);
    const requestedEnd = Date.parse(request.clipEndsAt);
    const all = await this.segments();

    let selected = all.filter(
      (segment) =>
        segment.modifiedAt >= requestedStart - 8_000 &&
        segment.modifiedAt <= requestedEnd + 8_000,
    );

    if (!selected.length) {
      selected = all.slice(-8);
    }

    if (!selected.length) {
      throw new Error(
        "O buffer local não possui segmentos para este acontecimento.",
      );
    }

    const work = path.join(
      os.tmpdir(),
      "MonitorIA",
      "clips",
      request.requestId,
    );
    await rm(work, { recursive: true, force: true });
    await mkdir(work, { recursive: true });

    const concatFile = path.join(work, "segments.txt");
    const output = path.join(work, "clip.mp4");
    const concat = selected
      .map((segment) => `file '${concatPath(segment.path)}'`)
      .join("\n");
    await writeFile(concatFile, `${concat}\n`, "utf8");

    const profiles = await this.resolveEncoders();
    const failures: string[] = [];
    let successfulEncoder: string | null = null;

    for (const profile of profiles) {
      await rm(output, { force: true });

      const result = await run(
        this.options.ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          concatFile,
          "-an",
          "-vf",
          "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
          ...profile.args,
          "-movflags",
          "+faststart",
          "-t",
          String(request.durationSeconds),
          "-y",
          output,
        ],
        150_000,
      );

      if (result.code === 0) {
        successfulEncoder = profile.name;
        break;
      }

      failures.push(
        `${profile.name}: ${
          result.stderr.replace(/\s+/g, " ").trim().slice(0, 300) ||
          `código ${result.code}`
        }`,
      );
    }

    if (!successfulEncoder) {
      throw new Error(
        `Nenhum encoder H.264 conseguiu gerar o clipe. ${failures.join(" | ")}`.slice(
          0,
          900,
        ),
      );
    }

    const outputStat = await stat(output);
    if (outputStat.size < 10_000) {
      throw new Error("O clipe gerado está vazio ou incompleto.");
    }

    if (outputStat.size > 25 * 1024 * 1024) {
      throw new Error("O clipe ultrapassou 25 MB.");
    }

    const cpuUsed = process.cpuUsage(cpuStarted);

    this.options.log(
      `Clipe H.264 gerado com ${successfulEncoder} · ${selected.length} segmento(s).`,
    );

    return {
      path: output,
      byteSize: outputStat.size,
      durationSeconds: request.durationSeconds,
      generationMs: Date.now() - started,
      cpuTimeMs: Math.round(
        (cpuUsed.user + cpuUsed.system) / 1000,
      ),
      segmentsUsed: selected.length,
    };
  }

  async stop() {
    this.stopped = true;
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.process?.kill();
    this.process = null;
    await this.prune();
  }
}
