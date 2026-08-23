import { readdir, rm, stat, statfs } from "node:fs/promises";
import path from "node:path";

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const EVENT_RESERVE_BYTES = 2 * GB;
const MIN_FREE_RESERVE_BYTES = 4 * GB;
const DEFAULT_VIDEO_CAP_BYTES = 8 * GB;
const MIN_VIDEO_BUDGET_BYTES = 512 * MB;

const runtimeProtectedPaths = new Map<string, number>();

export function protectVideoFiles(paths: string[]) {
  const unique = [...new Set(paths.map((value) => path.resolve(value)))];
  for (const file of unique) {
    runtimeProtectedPaths.set(file, (runtimeProtectedPaths.get(file) ?? 0) + 1);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const file of unique) {
      const remaining = (runtimeProtectedPaths.get(file) ?? 1) - 1;
      if (remaining <= 0) runtimeProtectedPaths.delete(file);
      else runtimeProtectedPaths.set(file, remaining);
    }
  };
}

export type VideoDiskFile = {
  path: string;
  bytes: number;
  mtimeMs: number;
  cameraId: string;
  kind: "timeline" | "evidence";
  protected: boolean;
};

async function scanVideoTree(root: string, kind: VideoDiskFile["kind"]) {
  const files: VideoDiskFile[] = [];
  const walk = async (current: string, cameraId: string | null, inheritedProtected = false) => {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); }
    catch { return; }

    let protectedHere = inheritedProtected;
    if (kind === "evidence" && current.endsWith(".sources")) {
      try {
        const lock = await stat(path.join(current, ".building"));
        protectedHere = Boolean(lock);
      } catch { /* fontes ociosas podem ser podadas sob pressão */ }
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full, cameraId ?? entry.name, protectedHere);
        continue;
      }
      if (!entry.isFile() || !(/\.(?:ts|mp4)$/i.test(entry.name))) continue;
      try {
        const s = await stat(full);
        files.push({
          path: full,
          bytes: s.size,
          mtimeMs: s.mtimeMs,
          cameraId: cameraId ?? "unknown",
          kind,
          protected: protectedHere || runtimeProtectedPaths.has(path.resolve(full)),
        });
      } catch { /* removido em paralelo */ }
    }
  };
  await walk(root, null);
  return files;
}

async function walkFiles(dataRoot: string) {
  const [timeline, evidence] = await Promise.all([
    scanVideoTree(path.join(dataRoot, "clip-buffer"), "timeline"),
    scanVideoTree(path.join(dataRoot, "event-video-evidence"), "evidence"),
  ]);
  return [...timeline, ...evidence];
}

/**
 * Um único orçamento de vídeo para todo o Agent.
 *
 * A fila de acontecimentos fica fora deste orçamento e tem prioridade. Em
 * pressão de disco removemos ring-buffer primeiro; só depois evidências de
 * vídeo, que continuam sendo menos importantes que o recibo/fotos do evento.
 */
export class GlobalVideoDiskBudget {
  private pruning: Promise<void> | null = null;
  private timelineEvictionsTotal = 0;
  private evidenceEvictionsTotal = 0;

  constructor(private readonly dataRoot: string) {}

  private async limits() {
    const configuredGb = Number(process.env.MONITORIA_VIDEO_BUFFER_MAX_GB ?? "");
    let filesystemFree = 20 * GB;
    let filesystemTotal = 100 * GB;
    try {
      const fs = await statfs(this.dataRoot);
      filesystemFree = Number(fs.bavail) * Number(fs.bsize);
      filesystemTotal = Number(fs.blocks) * Number(fs.bsize);
    } catch { /* fallback seguro */ }

    const hardCap = Number.isFinite(configuredGb) && configuredGb > 0
      ? configuredGb * GB
      : DEFAULT_VIDEO_CAP_BYTES;
    const freeReserve = Math.max(MIN_FREE_RESERVE_BYTES, filesystemTotal * 0.05, EVENT_RESERVE_BYTES);
    const adaptiveCap = Math.max(MIN_VIDEO_BUDGET_BYTES, filesystemTotal * 0.08);

    return {
      hardCap,
      adaptiveCap,
      freeReserve,
      filesystemFree,
    };
  }

  async prune(
    timelineKeepAfterMs: number,
    evidenceKeepAfterMs = Number.NEGATIVE_INFINITY,
    allowEvidencePressureEviction = true,
  ) {
    if (this.pruning) return this.pruning;
    this.pruning = this.doPrune(timelineKeepAfterMs, evidenceKeepAfterMs, allowEvidencePressureEviction)
      .finally(() => { this.pruning = null; });
    return this.pruning;
  }

  private async removeFile(file: VideoDiskFile) {
    await rm(file.path, { force: true });
    if (file.kind === "evidence") this.evidenceEvictionsTotal += 1;
    else this.timelineEvictionsTotal += 1;
    if (file.kind === "evidence" && file.path.toLowerCase().endsWith(".mp4")) {
      await rm(`${file.path}.json`, { force: true });
    }
  }

  private async doPrune(
    timelineKeepAfterMs: number,
    evidenceKeepAfterMs: number,
    allowEvidencePressureEviction: boolean,
  ) {
    const files = await walkFiles(this.dataRoot);
    const limits = await this.limits();
    const perCamera = new Map<string, number>();
    for (const f of files) perCamera.set(f.cameraId, (perCamera.get(f.cameraId) ?? 0) + f.bytes);

    let total = files.reduce((sum, f) => sum + f.bytes, 0);
    const expired = files
      .filter((file) => {
        if (file.protected) return false;
        if (file.kind === "timeline") return file.mtimeMs < timelineKeepAfterMs;
        return Number.isFinite(evidenceKeepAfterMs) && file.mtimeMs < evidenceKeepAfterMs;
      })
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === "timeline" ? -1 : 1;
        return a.mtimeMs - b.mtimeMs;
      });

    for (const file of expired) {
      await this.removeFile(file);
      total -= file.bytes;
      perCamera.set(file.cameraId, Math.max(0, (perCamera.get(file.cameraId) ?? 0) - file.bytes));
    }

    // O limite efetivo considera o espaço que será recuperado pela própria
    // poda. Se o filesystem já caiu abaixo da reserva de eventos, o orçamento
    // de vídeo pode chegar a ZERO — nunca forçamos 512 MB de vídeo enquanto
    // a fila durável de acontecimentos precisa de espaço.
    const freePressureCap = Math.max(0, total + limits.filesystemFree - limits.freeReserve);
    const targetVideoBytes = Math.max(
      0,
      Math.min(limits.hardCap, limits.adaptiveCap, freePressureCap),
    );

    if (total <= targetVideoBytes) return;

    // Sob pressão, ring-buffer é descartado antes de uma prova já fixada.
    const remaining = files
      .filter((file) =>
        !file.protected &&
        !expired.some((x) => x.path === file.path) &&
        (allowEvidencePressureEviction || file.kind === "timeline")
      )
      .sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "timeline" ? -1 : 1;
        return left.mtimeMs - right.mtimeMs;
      });

    while (total > targetVideoBytes && remaining.length) {
      const preferredKind = remaining.some((f) => f.kind === "timeline") ? "timeline" : "evidence";
      let targetCamera: string | null = null;
      let targetBytes = -1;
      for (const [cameraId, bytes] of perCamera) {
        if (bytes > targetBytes && remaining.some((f) => f.cameraId === cameraId && f.kind === preferredKind)) {
          targetCamera = cameraId;
          targetBytes = bytes;
        }
      }
      let index = remaining.findIndex((f) => f.kind === preferredKind && f.cameraId === targetCamera);
      if (index < 0) index = remaining.findIndex((f) => f.kind === preferredKind);
      const [file] = index >= 0 ? remaining.splice(index, 1) : remaining.splice(0, 1);
      if (!file) break;
      await this.removeFile(file);
      total -= file.bytes;
      perCamera.set(file.cameraId, Math.max(0, (perCamera.get(file.cameraId) ?? 0) - file.bytes));
    }
  }


  /**
   * Emergência usada somente quando a fila durável recebeu ENOSPC.
   * Primeiro descarta todo ring-buffer não protegido; evidência de vídeo só
   * entra na poda se ainda for necessário preservar a reserva do filesystem.
   * A fila/fotos de acontecimentos nunca fazem parte deste orçamento.
   */
  async releaseForEventPressure() {
    await this.prune(Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, false);
    const afterTimeline = await this.stats();
    if (afterTimeline.filesystemFreeBytes >= afterTimeline.reservedFreeBytes) return;
    await this.prune(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  }

  async stats() {
    const files = await walkFiles(this.dataRoot);
    const limits = await this.limits();
    const timeline = files.filter((f) => f.kind === "timeline");
    const evidence = files.filter((f) => f.kind === "evidence");
    const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
    const freePressureCap = Math.max(0, totalBytes + limits.filesystemFree - limits.freeReserve);
    const maxVideoBytes = Math.max(0, Math.min(limits.hardCap, limits.adaptiveCap, freePressureCap));
    return {
      totalBytes,
      timelineBytes: timeline.reduce((sum, f) => sum + f.bytes, 0),
      evidenceBytes: evidence.reduce((sum, f) => sum + f.bytes, 0),
      files: files.length,
      evidenceFiles: evidence.length,
      evidenceClips: evidence.filter((file) => file.path.toLowerCase().endsWith(".mp4")).length,
      cameras: new Set(files.map((f) => f.cameraId)).size,
      maxVideoBytes,
      configuredHardCapBytes: limits.hardCap,
      adaptiveCapBytes: limits.adaptiveCap,
      filesystemFreeBytes: limits.filesystemFree,
      reservedFreeBytes: limits.freeReserve,
      timelineEvictionsTotal: this.timelineEvictionsTotal,
      evidenceEvictionsTotal: this.evidenceEvictionsTotal,
    };
  }
}
