import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePaths } from "../paths.js";
import { sanitizeFfmpegError } from "../ffmpeg.js";
import { resolveFfprobe } from "../discovery/binaries.js";
import { MOTION_HEIGHT, MOTION_WIDTH } from "../motion.js";
const MOTION_FRAME_BYTES = MOTION_WIDTH * MOTION_HEIGHT;
import type { CapturedFrame } from "../types.js";
import { GlobalVideoDiskBudget, protectVideoFiles } from "./disk-budget.js";
import {
  VIDEO_MAX_CLIP_BYTES,
  shouldPassthroughVideo,
  transcodeVideoArguments,
  type VideoProbe,
} from "./video-policy.js";

const SEGMENT_SECONDS = 3;
const KEEP_BUFFER_MS = 15 * 60_000;
const MIN_SEGMENT_BYTES = 188 * 4;

type Segment = { path: string; name: string; bytes: number; modifiedAt: number; startedAt: number };
export type TimelineRawFrame = { capturedAt: string; bytes: Uint8Array };
export type TimelineEvidence = {
  source: "rtsp_timeline";
  segmentId: string;
  segmentStartedAt: string;
  sourceTimestamp: string;
  offsetMs: number;
  contentSha256: string;
};
export type TimelineCapturedFrame = CapturedFrame & { timeline: TimelineEvidence };

export type TimelineClipRequest = {
  requestId: string;
  eventId: string;
  clipStartsAt: string;
  clipEndsAt: string;
  durationSeconds: number;
};

export type TimelineBuiltClip = {
  path: string;
  byteSize: number;
  durationSeconds: number;
  generationMs: number;
  cpuTimeMs: number;
  segmentsUsed: number;
  transcoded: boolean;
  sourceBitrateKbps: number | null;
  outputBitrateKbps: number | null;
  segmentIds: string[];
};

type RunResult = { code: number; stdout: string; stderr: string };

function run(executable: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (c) => { stdout += String(c); });
    child.stderr?.on("data", (c) => { stderr += String(c); });
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    child.once("error", (e) => { clearTimeout(timer); reject(e); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("A operação do FFmpeg excedeu o limite."));
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

function safeId(value: string) { return value.replace(/[^a-zA-Z0-9-]/g, ""); }
function concatPath(value: string) { return value.replace(/\\/g, "/").replace(/'/g, "'\\''"); }


let evidenceWorkersActive = 0;
const evidenceWorkerWaiters: Array<() => void> = [];

function evidenceConcurrency() {
  const configured = Number(process.env.MONITORIA_LOCAL_VIDEO_CONCURRENCY ?? "");
  if (Number.isFinite(configured) && configured > 0) return Math.max(1, Math.min(4, Math.floor(configured)));
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(1, Math.min(2, Math.floor(cpus / 4) || 1));
}

async function acquireEvidenceWorker() {
  const limit = evidenceConcurrency();
  if (evidenceWorkersActive >= limit) {
    await new Promise<void>((resolve) => evidenceWorkerWaiters.push(resolve));
  }
  evidenceWorkersActive += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    evidenceWorkersActive = Math.max(0, evidenceWorkersActive - 1);
    evidenceWorkerWaiters.shift()?.();
  };
}

const managers = new Map<string, GlobalVideoDiskBudget>();
function managerFor(root: string) {
  let manager = managers.get(root);
  if (!manager) { manager = new GlobalVideoDiskBudget(root); managers.set(root, manager); }
  return manager;
}

export class CameraTimeline {
  private process: ChildProcess | null = null;
  private directory = "";
  private dataRoot = "";
  private videoRoot = "";
  private evidenceRoot = "";
  private stopped = false;
  private refs = 0;
  private pending = Buffer.alloc(0);
  private lastSampleAt = 0;
  private restartTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private stderr = "";
  private consecutiveFailures = 0;
  private reconnects = 0;
  private evidenceRecoveryBusy = false;
  private readonly subscribers = new Set<(frame: TimelineRawFrame) => void>();
  private readonly errorSubscribers = new Set<(error: Error) => void>();

  constructor(private readonly options: {
    cameraId: string;
    cameraName: string;
    ffmpegPath: string;
    rtspUrl: string;
    captureIntervalSeconds: number;
    log: (message: string) => void;
  }) {}

  addRef() { this.refs += 1; }
  async release() { this.refs = Math.max(0, this.refs - 1); if (this.refs === 0) await this.stop(); }
  isRunning() { return !this.stopped && Boolean(this.process); }
  reconnectCount() { return this.reconnects; }
  subscribe(callback: (frame: TimelineRawFrame) => void) { this.subscribers.add(callback); return () => this.subscribers.delete(callback); }
  onError(callback: (error: Error) => void) { this.errorSubscribers.add(callback); return () => this.errorSubscribers.delete(callback); }

  async start() {
    if (this.process || this.stopped) return;
    const layout = await resolvePaths();
    this.dataRoot = layout.root;
    this.videoRoot = path.join(layout.root, "clip-buffer");
    this.evidenceRoot = path.join(layout.root, "event-video-evidence", safeId(this.options.cameraId));
    this.directory = path.join(this.videoRoot, safeId(this.options.cameraId));
    await Promise.all([
      mkdir(this.directory, { recursive: true }),
      mkdir(this.evidenceRoot, { recursive: true }),
    ]);
    await managerFor(this.dataRoot).prune(Date.now() - KEEP_BUFFER_MS);
    void this.recoverPreservedEvidence();
    this.spawn();
    this.pruneTimer = setInterval(() => {
      void managerFor(this.dataRoot).prune(Date.now() - KEEP_BUFFER_MS);
      void this.recoverPreservedEvidence();
    }, 60_000);
  }

  private spawn() {
    if (this.stopped || this.process) return;
    const prefix = `${Date.now()}-%06d.ts`;
    const output = path.join(this.directory, prefix);

    // Um único input RTSP produz dois outputs: raw gray para movimento e
    // segmentos H.264/H.265 originais para a timeline. Não existe filtro fps:
    // o throttle é pelo relógio local, corrigindo repetição/congelamento da 1.0.1.
    const args = [
      "-hide_banner", "-loglevel", "warning", "-rtsp_transport", "tcp", "-i", this.options.rtspUrl,
      "-map", "0:v:0", "-an",
      "-vf", `scale=${MOTION_WIDTH}:${MOTION_HEIGHT}:force_original_aspect_ratio=decrease,pad=${MOTION_WIDTH}:${MOTION_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=gray`,
      "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1",
      "-map", "0:v:0", "-an", "-c:v", "copy",
      "-f", "segment", "-segment_time", String(SEGMENT_SECONDS), "-segment_format", "mpegts",
      "-reset_timestamps", "1", "-y", output,
    ];

    const child = spawn(this.options.ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    this.process = child;
    this.stderr = "";
    this.pending = Buffer.alloc(0);

    child.stdout?.on("data", (chunk: Buffer) => {
      this.pending = Buffer.concat([this.pending, chunk]);
      while (this.pending.length >= MOTION_FRAME_BYTES) {
        const frame = Buffer.from(this.pending.subarray(0, MOTION_FRAME_BYTES));
        this.pending = this.pending.subarray(MOTION_FRAME_BYTES);
        const sampleAt = Date.now();
        const intervalMs = Math.max(200, this.options.captureIntervalSeconds * 1000);
        if (sampleAt - this.lastSampleAt < intervalMs) continue;
        this.lastSampleAt = sampleAt;
        const item = { capturedAt: new Date(sampleAt).toISOString(), bytes: new Uint8Array(frame) };
        for (const subscriber of this.subscribers) {
          try { subscriber(item); } catch { /* um consumidor não derruba a timeline */ }
        }
      }
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => { this.stderr = `${this.stderr}${String(chunk)}`.slice(-4000); });
    child.once("error", (error) => { this.stderr = error.message; });
    child.once("close", () => {
      if (this.process === child) this.process = null;
      if (this.stopped) return;
      this.reconnects += 1;
      this.consecutiveFailures += 1;
      const detail = sanitizeFfmpegError(this.stderr) || "stream interrompido";
      this.options.log(`Timeline de "${this.options.cameraName}" interrompida: ${detail}. Reconectando.`);
      if (this.consecutiveFailures >= 3) {
        const error = new Error(detail);
        for (const subscriber of this.errorSubscribers) subscriber(error);
      }
      this.restartTimer = setTimeout(() => this.spawn(), Math.min(15_000, 2_000 * this.consecutiveFailures));
    });

    // Se ficar vivo alguns segundos, zera o contador de falhas consecutivas.
    setTimeout(() => {
      if (this.process === child && !this.stopped) this.consecutiveFailures = 0;
    }, 20_000).unref?.();
  }

  private async segments(): Promise<Segment[]> {
    if (!this.directory) return [];
    let entries;
    try { entries = await readdir(this.directory, { withFileTypes: true }); }
    catch { return []; }
    const result: Segment[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
      const full = path.join(this.directory, entry.name);
      try {
        const s = await stat(full);
        if (s.size < MIN_SEGMENT_BYTES || Date.now() - s.mtimeMs < 400) continue;
        result.push({
          path: full,
          name: entry.name,
          bytes: s.size,
          modifiedAt: s.mtimeMs,
          startedAt: s.mtimeMs - SEGMENT_SECONDS * 1000,
        });
      } catch { /* finalizando */ }
    }
    return result.sort((a, b) => a.modifiedAt - b.modifiedAt);
  }

  private async waitForSegments(targetMs: number) {
    const deadline = Date.now() + 5_000;
    let all: Segment[] = [];
    do {
      all = await this.segments();
      if (all.some((s) => targetMs >= s.startedAt - 1500 && targetMs <= s.modifiedAt + 1500)) return all;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    return all;
  }

  async captureAt(targetAt: string, options: { maxWidth?: number; quality?: number; prefix?: string } = {}): Promise<TimelineCapturedFrame> {
    const targetMs = Date.parse(targetAt);
    const segments = await this.waitForSegments(targetMs);
    if (!segments.length) throw new Error("A timeline local ainda não possui segmento para a evidência.");

    const segment = [...segments].sort((a, b) => {
      const amid = (a.startedAt + a.modifiedAt) / 2;
      const bmid = (b.startedAt + b.modifiedAt) / 2;
      return Math.abs(amid - targetMs) - Math.abs(bmid - targetMs);
    })[0]!;

    const offsetMs = Math.max(0, Math.min(SEGMENT_SECONDS * 1000 - 50, targetMs - segment.startedAt));
    // Frames selecionados para um acontecimento nascem no diretório durável
    // do Agent, não no TEMP do sistema. Se o processo/reboot acontecer no
    // meio do commit da fila, o recovery.json continua apontando para uma
    // origem que sobrevive à reinicialização.
    const directory = path.join(
      this.dataRoot || (await resolvePaths()).root,
      "pending-event-frames",
      safeId(this.options.cameraId),
    );
    await mkdir(directory, { recursive: true });
    const safePrefix = String(options.prefix ?? "timeline").replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80);
    const output = path.join(directory, `${safeId(this.options.cameraId)}-${safePrefix}-${Date.now()}.jpg`);
    const maxWidth = Math.max(320, Math.min(1920, Math.floor(options.maxWidth ?? 1280)));
    const quality = Math.max(2, Math.min(12, Math.floor(options.quality ?? 3)));

    const releaseSegment = protectVideoFiles([segment.path]);
    let result: RunResult;
    let s;
    let bytes: Buffer;
    try {
      result = await run(this.options.ffmpegPath, [
        "-hide_banner", "-loglevel", "error", "-ss", (offsetMs / 1000).toFixed(3),
        "-i", segment.path, "-map", "0:v:0", "-frames:v", "1", "-an",
        "-vf", `scale=${maxWidth}:-2:force_original_aspect_ratio=decrease`,
        "-q:v", String(quality), "-y", output,
      ], 20_000);

      if (result.code !== 0) throw new Error(sanitizeFfmpegError(result.stderr) || "Falha ao extrair evidência da timeline.");
      s = await stat(output);
      if (s.size < 1024) throw new Error("A evidência extraída ficou vazia.");
      bytes = await readFile(output);
    } finally {
      releaseSegment();
    }
    const sha = createHash("sha256").update(bytes).digest("hex");

    return {
      path: output,
      width: null,
      height: null,
      byteSize: s.size,
      capturedAt: new Date(targetMs).toISOString(),
      timeline: {
        source: "rtsp_timeline",
        segmentId: segment.name,
        segmentStartedAt: new Date(segment.startedAt).toISOString(),
        sourceTimestamp: new Date(targetMs).toISOString(),
        offsetMs: Math.round(offsetMs),
        contentSha256: sha,
      },
    };
  }

  private async probe(segment: Segment): Promise<VideoProbe> {
    try {
      const ffprobe = await resolveFfprobe();
      const result = await run(ffprobe, [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,avg_frame_rate,bit_rate",
        "-of", "json", segment.path,
      ], 10_000);
      if (result.code !== 0) throw new Error(result.stderr);
      const stream = JSON.parse(result.stdout)?.streams?.[0] ?? {};
      const [num, den] = String(stream.avg_frame_rate ?? "0/1").split("/").map(Number);
      const fps = den ? num / den : null;
      return {
        codec: stream.codec_name ? String(stream.codec_name).toLowerCase() : null,
        width: Number.isFinite(Number(stream.width)) ? Number(stream.width) : null,
        height: Number.isFinite(Number(stream.height)) ? Number(stream.height) : null,
        fps: Number.isFinite(fps) ? fps : null,
        bitrateKbps: Number.isFinite(Number(stream.bit_rate)) && Number(stream.bit_rate) > 0
          ? Number(stream.bit_rate) / 1000 : null,
      };
    } catch {
      return { codec: null, width: null, height: null, fps: null, bitrateKbps: null };
    }
  }

  private async buildClipFromSegments(
    request: TimelineClipRequest,
    selected: Segment[],
  ): Promise<TimelineBuiltClip> {
    const started = Date.now();
    const cpuStarted = process.cpuUsage();
    if (!selected.length) throw new Error("A timeline local não possui segmentos para este acontecimento.");

    // A poda global conhece estes paths e os trata como in-flight até FFmpeg
    // terminar de ler todos eles. Isso vale tanto para ring quanto para cópias
    // fixadas de evidência.
    const releaseSources = protectVideoFiles(selected.map((segment) => segment.path));
    try {
      const work = path.join(os.tmpdir(), "MonitorIA", "clips", request.requestId);
      await rm(work, { recursive: true, force: true });
      await mkdir(work, { recursive: true });
      const concatFile = path.join(work, "segments.txt");
      const output = path.join(work, "clip.mp4");
      await writeFile(
        concatFile,
        `${selected.map((segment) => `file '${concatPath(segment.path)}'`).join("\n")}\n`,
        "utf8",
      );

      const totalSourceBytes = selected.reduce((sum, segment) => sum + segment.bytes, 0);
      const selectedSpanSeconds = Math.max(
        1,
        ((selected.at(-1)?.modifiedAt ?? Date.parse(request.clipEndsAt)) -
          (selected[0]?.startedAt ?? Date.parse(request.clipStartsAt))) / 1000,
      );
      const sourceKbpsFromBytes = (totalSourceBytes * 8) / selectedSpanSeconds / 1000;
      const probe = await this.probe(selected[0]!);
      if (probe.bitrateKbps === null) probe.bitrateKbps = sourceKbpsFromBytes;
      const passthrough = shouldPassthroughVideo(probe);

      // `selected` inclui uma pequena margem para tolerar timestamps de TS.
      // Sem este seek, o `-t` começava no primeiro segmento marginal e podia
      // encerrar o MP4 alguns segundos ANTES do fim real do acontecimento.
      // O offset mantém pré/pós-roll e garante cobertura até clipEndsAt.
      const requestedStartMs = Date.parse(request.clipStartsAt);
      const selectedStartMs = selected[0]?.startedAt ?? requestedStartMs;
      const seekSeconds = Number.isFinite(requestedStartMs)
        ? Math.max(0, (requestedStartMs - selectedStartMs) / 1000)
        : 0;
      const seekArgs = seekSeconds > 0.05 ? ["-ss", seekSeconds.toFixed(3)] : [];

      let transcoded = !passthrough;
      let result: RunResult;

      if (passthrough) {
        result = await run(this.options.ffmpegPath, [
          "-hide_banner", "-loglevel", "error", "-fflags", "+genpts",
          "-f", "concat", "-safe", "0", "-i", concatFile, ...seekArgs,
          "-map", "0:v:0", "-an", "-c:v", "copy",
          "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
          "-t", String(request.durationSeconds), "-y", output,
        ], 90_000);
      } else {
        result = await run(this.options.ffmpegPath, [
          "-hide_banner", "-loglevel", "error", "-fflags", "+genpts",
          "-f", "concat", "-safe", "0", "-i", concatFile, ...seekArgs,
          "-map", "0:v:0", ...transcodeVideoArguments(),
          "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
          "-t", String(request.durationSeconds), "-y", output,
        ], 5 * 60_000);
      }

      if (result.code !== 0 && passthrough) {
        transcoded = true;
        result = await run(this.options.ffmpegPath, [
          "-hide_banner", "-loglevel", "error", "-fflags", "+genpts",
          "-f", "concat", "-safe", "0", "-i", concatFile, ...seekArgs,
          "-map", "0:v:0", ...transcodeVideoArguments(),
          "-avoid_negative_ts", "make_zero", "-movflags", "+faststart",
          "-t", String(request.durationSeconds), "-y", output,
        ], 5 * 60_000);
      }

      if (result.code !== 0) {
        throw new Error(sanitizeFfmpegError(result.stderr) || "Falha ao gerar clipe.");
      }
      const out = await stat(output);
      if (out.size < 10_000) throw new Error("O clipe ficou vazio ou incompleto.");
      if (out.size > VIDEO_MAX_CLIP_BYTES) throw new Error("O clipe ultrapassou o teto de 100 MB.");

      const cpu = process.cpuUsage(cpuStarted);
      return {
        path: output,
        byteSize: out.size,
        durationSeconds: request.durationSeconds,
        generationMs: Date.now() - started,
        cpuTimeMs: Math.round((cpu.user + cpu.system) / 1000),
        segmentsUsed: selected.length,
        transcoded,
        sourceBitrateKbps: probe.bitrateKbps,
        outputBitrateKbps: (out.size * 8) / Math.max(1, request.durationSeconds) / 1000,
        segmentIds: selected.map((segment) => segment.name),
      };
    } finally {
      releaseSources();
    }
  }

  async buildClip(request: TimelineClipRequest): Promise<TimelineBuiltClip> {
    const startMs = Date.parse(request.clipStartsAt);
    const endMs = Date.parse(request.clipEndsAt);
    const all = await this.waitForSegments(endMs - 500);
    const selected = all.filter((segment) =>
      segment.modifiedAt >= startMs - 5_000 && segment.startedAt <= endMs + 5_000
    );
    return this.buildClipFromSegments(request, selected);
  }

  private evidencePath(eventId: string) {
    return path.join(this.evidenceRoot, `${safeId(eventId)}.mp4`);
  }

  private evidenceSourceDirectory(eventId: string) {
    return path.join(this.evidenceRoot, `${safeId(eventId)}.sources`);
  }

  private clipWindow(startedAt: string, endedAt: string, maxAllowedSeconds?: number | null) {
    const startMs = Date.parse(startedAt);
    const endMs = Date.parse(endedAt);
    const eventSeconds = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? (endMs - startMs) / 1000
      : 15;
    const ceiling = Number.isFinite(Number(maxAllowedSeconds)) && Number(maxAllowedSeconds) > 0
      ? Math.min(310, Math.floor(Number(maxAllowedSeconds)))
      : 310;
    const durationSeconds = Math.max(15, Math.min(ceiling, Math.ceil(3 + eventSeconds + 2)));
    const clipStartsAt = new Date(startMs - 3_000).toISOString();
    const clipEndsAt = new Date(startMs - 3_000 + durationSeconds * 1000).toISOString();
    return { clipStartsAt, clipEndsAt, durationSeconds };
  }

  private async pinEvidenceSources(eventId: string, request: TimelineClipRequest) {
    const startMs = Date.parse(request.clipStartsAt);
    const endMs = Date.parse(request.clipEndsAt);
    const all = await this.waitForSegments(endMs - 500);
    const selected = all.filter((segment) =>
      segment.modifiedAt >= startMs - 5_000 && segment.startedAt <= endMs + 5_000
    );
    if (!selected.length) throw new Error("A timeline não possui segmentos para fixar a evidência.");

    const sourceDirectory = this.evidenceSourceDirectory(eventId);
    await rm(sourceDirectory, { recursive: true, force: true });
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(path.join(sourceDirectory, ".building"), new Date().toISOString(), "utf8");

    // Protege os segmentos do ring durante a cópia. Sem isto, a poda global
    // poderia remover um arquivo entre o stat e o copyFile quando o disco
    // estivesse sob pressão.
    const releaseSources = protectVideoFiles(selected.map((segment) => segment.path));
    try {
      // O manifesto nasce ANTES das cópias. Se o processo cair entre dois
      // copyFile, a recuperação sabe quais destinos faltam e, enquanto o ring
      // ainda tiver a fonte, completa a evidência sem depender da IA.
      const manifestSegments = selected.map((segment, index) => ({
        file: `${String(index).padStart(4, "0")}-${segment.name}`,
        sourcePath: segment.path,
        name: segment.name,
        bytes: segment.bytes,
        modifiedAt: segment.modifiedAt,
        startedAt: segment.startedAt,
      }));
      await writeFile(
        path.join(sourceDirectory, "job.json"),
        `${JSON.stringify({ eventId, request, segments: manifestSegments }, null, 2)}\n`,
        "utf8",
      );

      const pinned: Segment[] = [];
      for (const segment of manifestSegments) {
        const destination = path.join(sourceDirectory, segment.file);
        // Cópia real, não hard-link: orçamento de disco e remoção passam a
        // refletir bytes efetivamente independentes em Windows e Linux.
        await copyFile(segment.sourcePath, destination);
        const info = await stat(destination);
        pinned.push({
          path: destination,
          name: segment.name,
          bytes: info.size,
          modifiedAt: segment.modifiedAt,
          startedAt: segment.startedAt,
        });
      }
      return pinned;
    } finally {
      releaseSources();
    }
  }

  private async buildPinnedClip(request: TimelineClipRequest, selected: Segment[]) {
    // Mesma política de codec/bitrate, mas sobre fontes fixadas fora do ring.
    return this.buildClipFromSegments(request, selected);
  }

  async preserveEventClip(
    eventId: string,
    startedAt: string,
    endedAt: string,
    maxAllowedSeconds?: number | null,
  ) {
    if (!this.evidenceRoot) return;
    const finalPath = this.evidencePath(eventId);
    try {
      const existing = await stat(finalPath);
      if (existing.size > 10_000) return;
    } catch { /* ainda não existe */ }

    const window = this.clipWindow(startedAt, endedAt, maxAllowedSeconds);
    const request: TimelineClipRequest = {
      requestId: `local-${safeId(eventId)}`,
      eventId,
      ...window,
    };
    const pinned = await this.pinEvidenceSources(eventId, request);
    const sourceDirectory = this.evidenceSourceDirectory(eventId);
    const releaseWorker = await acquireEvidenceWorker();
    let completed = false;

    try {
      const built = await this.buildPinnedClip(request, pinned);
      await mkdir(this.evidenceRoot, { recursive: true });
      await rm(finalPath, { force: true });
      await rename(built.path, finalPath);
      await writeFile(`${finalPath}.json`, `${JSON.stringify({
        ...built,
        path: finalPath,
        eventId,
        clipStartsAt: request.clipStartsAt,
        clipEndsAt: request.clipEndsAt,
        createdAt: new Date().toISOString(),
      }, null, 2)}\n`, "utf8");
      await rm(path.dirname(built.path), { recursive: true, force: true });
      completed = true;
      this.options.log(`Vídeo local do evento ${eventId} fixado independentemente da IA.`);
    } finally {
      releaseWorker();
      if (completed) {
        await rm(sourceDirectory, { recursive: true, force: true });
      } else {
        // Mantém TS + job.json para a recuperação periódica; remove apenas a
        // trava de build para permitir nova tentativa e poda em pressão real.
        await rm(path.join(sourceDirectory, ".building"), { force: true });
      }
      await managerFor(this.dataRoot).prune(Date.now() - KEEP_BUFFER_MS);
    }
  }

  private async recoverPreservedEvidence() {
    if (this.evidenceRecoveryBusy || !this.evidenceRoot) return;
    this.evidenceRecoveryBusy = true;
    try {
      let entries;
      try { entries = await readdir(this.evidenceRoot, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".sources")) continue;
      const sourceDirectory = path.join(this.evidenceRoot, entry.name);
      try {
        await writeFile(path.join(sourceDirectory, ".building"), new Date().toISOString(), "utf8");
        const job = JSON.parse(await readFile(path.join(sourceDirectory, "job.json"), "utf8"));
        const metadata = Array.isArray(job.segments) ? job.segments : [];
        const selected: Segment[] = [];
        for (const [index, rawMeta] of metadata.entries()) {
          const meta = rawMeta && typeof rawMeta === "object" ? rawMeta as Record<string, unknown> : {};
          const file = typeof meta.file === "string" && meta.file.endsWith(".ts")
            ? meta.file
            : `${String(index).padStart(4, "0")}-${String(meta.name ?? `segment-${index}.ts`)}`;
          const full = path.join(sourceDirectory, path.basename(file));

          let info;
          try {
            info = await stat(full);
          } catch {
            const sourcePath = typeof meta.sourcePath === "string" ? meta.sourcePath : "";
            if (!sourcePath) throw new Error(`fonte ausente para ${file}`);
            const releaseSource = protectVideoFiles([sourcePath]);
            try {
              await copyFile(sourcePath, full);
              info = await stat(full);
            } finally {
              releaseSource();
            }
          }

          selected.push({
            path: full,
            name: String(meta.name ?? file),
            bytes: info.size,
            modifiedAt: Number(meta.modifiedAt ?? info.mtimeMs),
            startedAt: Number(meta.startedAt ?? (info.mtimeMs - SEGMENT_SECONDS * 1000)),
          });
        }
        if (!selected.length) throw new Error("sem segmentos fixados");
        const releaseWorker = await acquireEvidenceWorker();
        let built: TimelineBuiltClip;
        try {
          built = await this.buildPinnedClip(job.request as TimelineClipRequest, selected);
        } finally {
          releaseWorker();
        }
        const finalPath = this.evidencePath(String(job.eventId));
        await rm(finalPath, { force: true });
        await rename(built.path, finalPath);
        await writeFile(`${finalPath}.json`, `${JSON.stringify({
          ...built,
          path: finalPath,
          eventId: String(job.eventId),
          clipStartsAt: job.request.clipStartsAt,
          clipEndsAt: job.request.clipEndsAt,
          recoveredAt: new Date().toISOString(),
        }, null, 2)}\n`, "utf8");
        await rm(path.dirname(built.path), { recursive: true, force: true });
        await rm(sourceDirectory, { recursive: true, force: true });
        this.options.log(`Vídeo local ${job.eventId} recuperado após reinício.`);
      } catch (error) {
        await rm(path.join(sourceDirectory, ".building"), { force: true }).catch(() => undefined);
        this.options.log(`Evidência de vídeo pendente será mantida para nova recuperação: ${error instanceof Error ? error.message : String(error)}`);
      }
      }
    } finally {
      this.evidenceRecoveryBusy = false;
    }
  }

  async preservedClip(eventId: string): Promise<TimelineBuiltClip | null> {
    const file = this.evidencePath(eventId);
    try {
      const [info, raw] = await Promise.all([stat(file), readFile(`${file}.json`, "utf8")]);
      if (info.size < 10_000) return null;
      const metadata = JSON.parse(raw);
      return {
        path: file,
        byteSize: info.size,
        durationSeconds: Number(metadata.durationSeconds ?? 0),
        generationMs: Number(metadata.generationMs ?? 0),
        cpuTimeMs: Number(metadata.cpuTimeMs ?? 0),
        segmentsUsed: Number(metadata.segmentsUsed ?? 0),
        transcoded: Boolean(metadata.transcoded),
        sourceBitrateKbps: metadata.sourceBitrateKbps == null ? null : Number(metadata.sourceBitrateKbps),
        outputBitrateKbps: metadata.outputBitrateKbps == null ? null : Number(metadata.outputBitrateKbps),
        segmentIds: Array.isArray(metadata.segmentIds) ? metadata.segmentIds.map(String) : [],
      };
    } catch { return null; }
  }

  async removePreservedClip(eventId: string) {
    const file = this.evidencePath(eventId);
    await Promise.all([
      rm(file, { force: true }),
      rm(`${file}.json`, { force: true }),
      rm(this.evidenceSourceDirectory(eventId), { recursive: true, force: true }),
    ]);
  }

  async diskStats() {
    return managerFor(this.dataRoot).stats();
  }

  async stop() {
    if (this.stopped) return;
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    const child = this.process;
    this.process = null;
    child?.kill();
    await managerFor(this.dataRoot).prune(Date.now() - KEEP_BUFFER_MS);
  }
}

type RegistryEntry = {
  timeline: CameraTimeline;
  refs: number;
  signature: string;
  ready: Promise<void>;
};
const registry = new Map<string, RegistryEntry>();

function signature(input: { rtspUrl: string; ffmpegPath: string }) {
  return createHash("sha256").update(`${input.ffmpegPath}\0${input.rtspUrl}`).digest("hex");
}

export async function acquireTimeline(options: ConstructorParameters<typeof CameraTimeline>[0]) {
  const sig = signature(options);
  const existing = registry.get(options.cameraId);
  if (existing && existing.signature === sig) {
    existing.refs += 1;
    existing.timeline.addRef();
    await existing.ready;
    return existing.timeline;
  }
  if (existing) {
    registry.delete(options.cameraId);
    await existing.ready.catch(() => undefined);
    await existing.timeline.stop();
  }

  // Reserva a entrada ANTES do primeiro await. EventMonitor e ClipBuffer são
  // iniciados quase juntos pelo serviço; sem esta reserva, ambos podiam ver o
  // registry vazio e abrir duas sessões RTSP para a mesma câmera.
  const timeline = new CameraTimeline(options);
  timeline.addRef();
  const ready = timeline.start();
  registry.set(options.cameraId, { timeline, refs: 1, signature: sig, ready });

  try {
    await ready;
    return timeline;
  } catch (error) {
    if (registry.get(options.cameraId)?.timeline === timeline) {
      registry.delete(options.cameraId);
    }
    await timeline.stop().catch(() => undefined);
    throw error;
  }
}

export async function releaseTimeline(cameraId: string, timeline: CameraTimeline) {
  const entry = registry.get(cameraId);
  if (!entry || entry.timeline !== timeline) return timeline.release();
  entry.refs = Math.max(0, entry.refs - 1);
  await timeline.release();
  if (entry.refs === 0) registry.delete(cameraId);
}

export function activeTimeline(cameraId: string) {
  return registry.get(cameraId)?.timeline ?? null;
}
