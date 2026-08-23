import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { resolvePaths, writeFileAtomic } from "./paths.js";
import { GlobalVideoDiskBudget } from "./v102/disk-budget.js";
import type { LocalEventFrame, LocalMotionEvent } from "./types.js";

const STATE_FILE = "state.json";
const STAGING_SUFFIX = ".staging";
const EVENT_FILE = "event.json";
const FRAMES_DIRECTORY = "frames";
const RECOVERY_FILE = "recovery.json";
const BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 300_000, 900_000];

export type QueuedEntry = {
  id: string;
  event: LocalMotionEvent;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string | null;
  leaseToken?: string | null;
  leaseUntil?: string | null;
};

type PersistedEntry = {
  version: 1 | 2;
  event: Omit<LocalMotionEvent, "frames"> & {
    frames: Array<Omit<LocalEventFrame, "frame"> & {
      frame: Omit<LocalEventFrame["frame"], "path"> & { file: string } & Record<string, unknown>;
    }>;
  };
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string | null;
  leaseToken?: string | null;
  leaseUntil?: string | null;
};

type QueueState = { version: 2; dropped: number; rejected: number; completed: number };
export type QueueStats = {
  pending: number;
  readyNow: number;
  leased: number;
  totalBytes: number;
  oldestCreatedAt: string | null;
  oldestAgeSeconds: number;
  camerasPending: number;
  dropped: number;
  rejected: number;
  completed: number;
};

const backoffFor = (attempts: number) => BACKOFF_STEPS_MS[Math.min(attempts, BACKOFF_STEPS_MS.length - 1)] ?? 900_000;

async function directorySize(target: string) {
  let total = 0;
  const walk = async (current: string) => {
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else try { total += (await stat(full)).size; } catch { /* removido */ }
    }
  };
  await walk(target);
  return total;
}

export class PersistentEventQueue {
  private root = "";
  private stateFile = "";
  private state: QueueState = { version: 2, dropped: 0, rejected: 0, completed: 0 };
  private ready = false;
  private dataRoot = "";
  private lastCameraId: string | null = null;
  private claimBusy = false;

  constructor(private readonly options: {
    log: (message: string) => void;
    maxBytes?: number;
    maxAgeMs?: number;
  }) {}

  // Limites destrutivos só existem quando um operador os fornece
  // explicitamente. A configuração de produção não define nenhum: sob carga,
  // o backlog cresce e a telemetria avisa; o Agent nunca apaga acontecimentos
  // para caber num teto local arbitrário.
  private get maxBytes() { return this.options.maxBytes ?? null; }
  private get maxAgeMs() { return this.options.maxAgeMs ?? null; }

  async open() {
    if (this.ready) return;
    const layout = await resolvePaths();
    this.dataRoot = layout.root;
    this.root = layout.queueDirectory;
    this.stateFile = path.join(this.root, STATE_FILE);
    await mkdir(this.root, { recursive: true });
    try {
      const parsed = JSON.parse(await readFile(this.stateFile, "utf8")) as Partial<QueueState>;
      this.state = {
        version: 2,
        dropped: Number(parsed.dropped ?? 0),
        rejected: Number(parsed.rejected ?? 0),
        completed: Number(parsed.completed ?? 0),
      };
    } catch { /* primeira execução */ }

    let recovered = 0;
    let abandoned = 0;
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(STAGING_SUFFIX)) continue;
      const staging = path.join(this.root, entry.name);
      const id = entry.name.slice(0, -STAGING_SUFFIX.length);
      const finalDir = path.join(this.root, id);
      try {
        const draft = JSON.parse(await readFile(path.join(staging, RECOVERY_FILE), "utf8")) as {
          persisted: PersistedEntry;
          sources: Array<{ source: string; file: string }>;
        };
        const framesDirectory = path.join(staging, FRAMES_DIRECTORY);
        await mkdir(framesDirectory, { recursive: true });
        for (const source of draft.sources ?? []) {
          const destination = path.join(framesDirectory, source.file);
          try { if ((await stat(destination)).size > 0) continue; } catch { /* copia abaixo */ }
          await copyFile(source.source, destination);
        }
        await writeFileAtomic(path.join(staging, EVENT_FILE), `${JSON.stringify(draft.persisted, null, 2)}\n`);
        await rename(staging, finalDir);
        for (const source of draft.sources ?? []) await unlink(source.source).catch(() => undefined);
        recovered += 1;
      } catch {
        // Um staging sem manifesto recuperável é resíduo de uma versão antiga.
        // Ele nunca representa um evento confirmado na fila.
        await rm(staging, { recursive: true, force: true });
        abandoned += 1;
      }
    }
    if (recovered) this.options.log(`Recuperadas ${recovered} gravação(ões) interrompida(s) da fila.`);
    if (abandoned) this.options.log(`Removidos ${abandoned} staging(s) legados sem manifesto recuperável.`);
    this.ready = true;
    await this.prune();
  }

  private assertReady() { if (!this.ready) throw new Error("A fila de eventos não foi inicializada."); }
  private saveState() { return writeFileAtomic(this.stateFile, `${JSON.stringify(this.state, null, 2)}\n`); }

  async enqueue(event: LocalMotionEvent) {
    return this.enqueueWithPressureRecovery(event, false);
  }

  private async enqueueWithPressureRecovery(
    event: LocalMotionEvent,
    pressureRecovered: boolean,
  ): Promise<boolean> {
    this.assertReady();
    const staging = path.join(this.root, `${event.eventId}${STAGING_SUFFIX}`);
    const finalDir = path.join(this.root, event.eventId);
    const framesDirectory = path.join(staging, FRAMES_DIRECTORY);

    // Idempotência local: se o evento já foi persistido, não duplica.
    try { if ((await stat(finalDir)).isDirectory()) return true; } catch { /* novo */ }

    try {
      await mkdir(framesDirectory, { recursive: true });
      const frames: PersistedEntry["event"]["frames"] = [];
      const sources: Array<{ source: string; file: string }> = [];
      for (const [index, item] of event.frames.entries()) {
        const extension = path.extname(item.frame.path) || ".jpg";
        const file = `${String(index).padStart(2, "0")}${extension}`;
        const { path: _discarded, ...rest } = item.frame as LocalEventFrame["frame"] & Record<string, unknown>;
        frames.push({ label: item.label, frame: { ...rest, file } });
        sources.push({ source: item.frame.path, file });
      }
      const now = new Date().toISOString();
      const { frames: _frames, ...eventRest } = event;
      const persisted: PersistedEntry = {
        version: 2,
        event: { ...eventRest, frames },
        attempts: 0,
        createdAt: now,
        nextAttemptAt: now,
        lastError: null,
        leaseToken: null,
        leaseUntil: null,
      };

      // O manifesto vem antes das cópias. Se o processo cair em qualquer ponto,
      // open() consegue terminar a gravação na próxima inicialização.
      await writeFileAtomic(path.join(staging, RECOVERY_FILE), `${JSON.stringify({ persisted, sources }, null, 2)}\n`);
      for (const source of sources) {
        await copyFile(source.source, path.join(framesDirectory, source.file));
      }
      await writeFileAtomic(path.join(staging, EVENT_FILE), `${JSON.stringify(persisted, null, 2)}\n`);
      await rename(staging, finalDir);
      for (const source of sources) await unlink(source.source).catch(() => undefined);
    } catch (error) {
      // ENOSPC: vídeo cede espaço antes de desistirmos do commit do evento.
      const code = error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "";
      if (!pressureRecovered && code === "ENOSPC" && this.dataRoot) {
        this.options.log(`Disco pressionado ao gravar ${event.eventId}; liberando vídeo antes de repetir.`);
        await new GlobalVideoDiskBudget(this.dataRoot).releaseForEventPressure();
        return this.enqueueWithPressureRecovery(event, true);
      }
      // Não apaga staging nem origem: ambos são necessários para recuperação.
      this.options.log(`Gravação de ${event.eventId} interrompida; será retomada automaticamente.`);
      throw error;
    }
    await this.prune();
    return true;
  }

  private async listIds() {
    this.assertReady();
    return (await readdir(this.root, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.name.endsWith(STAGING_SUFFIX))
      .map((e) => e.name);
  }

  private async readEntry(id: string): Promise<QueuedEntry | null> {
    const directory = path.join(this.root, id);
    let persisted: PersistedEntry;
    try { persisted = JSON.parse(await readFile(path.join(directory, EVENT_FILE), "utf8")); }
    catch { return null; }

    const frames: LocalEventFrame[] = persisted.event.frames.map((item) => {
      const { file, ...rest } = item.frame;
      return {
        label: item.label,
        frame: { ...rest, path: path.join(directory, FRAMES_DIRECTORY, String(file)) } as LocalEventFrame["frame"],
      };
    });
    return {
      id,
      event: { ...persisted.event, frames } as LocalMotionEvent,
      attempts: persisted.attempts,
      createdAt: persisted.createdAt,
      nextAttemptAt: persisted.nextAttemptAt,
      lastError: persisted.lastError,
      leaseToken: persisted.leaseToken ?? null,
      leaseUntil: persisted.leaseUntil ?? null,
    };
  }

  private async mutate(id: string, update: (entry: PersistedEntry) => void) {
    const file = path.join(this.root, id, EVENT_FILE);
    let entry: PersistedEntry;
    try { entry = JSON.parse(await readFile(file, "utf8")); } catch { return false; }
    entry.version = 2;
    update(entry);
    await writeFileAtomic(file, `${JSON.stringify(entry, null, 2)}\n`);
    return true;
  }

  /**
   * Claim justo: um item por câmera por rodada, depois volta ao início.
   * Lease persistido permite concorrência e recuperação após crash.
   */
  async claimFair(limit: number, leaseMs = 120_000): Promise<QueuedEntry[]> {
    this.assertReady();
    // Só existe um selecionador por processo. Os uploads continuam concorrentes,
    // mas dois ticks sobrepostos não conseguem relocar o mesmo item local.
    if (this.claimBusy) return [];
    this.claimBusy = true;
    try {
    const now = Date.now();
    const candidates: QueuedEntry[] = [];
    for (const id of await this.listIds()) {
      const entry = await this.readEntry(id);
      if (!entry) continue;
      if (Date.parse(entry.nextAttemptAt) > now) continue;
      if (entry.leaseUntil && Date.parse(entry.leaseUntil) > now) continue;
      candidates.push(entry);
    }

    const groups = new Map<string, QueuedEntry[]>();
    for (const entry of candidates) {
      const list = groups.get(entry.event.cameraId) ?? [];
      list.push(entry);
      groups.set(entry.event.cameraId, list);
    }
    for (const list of groups.values()) list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

    let cameras = [...groups.keys()].sort();
    if (this.lastCameraId && cameras.length > 1) {
      const i = cameras.indexOf(this.lastCameraId);
      if (i >= 0) cameras = [...cameras.slice(i + 1), ...cameras.slice(0, i + 1)];
    }

    const selected: QueuedEntry[] = [];
    while (selected.length < Math.max(1, limit) && cameras.length) {
      let progressed = false;
      for (const cameraId of cameras) {
        if (selected.length >= limit) break;
        const item = groups.get(cameraId)?.shift();
        if (!item) continue;
        progressed = true;
        const leaseToken = randomUUID();
        const leaseUntil = new Date(Date.now() + Math.max(30_000, leaseMs)).toISOString();
        const ok = await this.mutate(item.id, (persisted) => {
          persisted.leaseToken = leaseToken;
          persisted.leaseUntil = leaseUntil;
        });
        if (ok) {
          item.leaseToken = leaseToken;
          item.leaseUntil = leaseUntil;
          selected.push(item);
          this.lastCameraId = cameraId;
        }
      }
      if (!progressed) break;
      cameras = cameras.filter((id) => (groups.get(id)?.length ?? 0) > 0);
    }
    return selected;
    } finally {
      this.claimBusy = false;
    }
  }

  /** Compatibilidade com código antigo. */
  async next() { return (await this.claimFair(1))[0] ?? null; }

  async complete(id: string, leaseToken?: string | null) {
    if (leaseToken) {
      const entry = await this.readEntry(id);
      if (!entry || entry.leaseToken !== leaseToken) return false;
    }
    await rm(path.join(this.root, id), { recursive: true, force: true });
    this.state.completed += 1;
    await this.saveState();
    return true;
  }

  async defer(id: string, reason: string, leaseToken?: string | null) {
    return this.mutate(id, (entry) => {
      if (leaseToken && entry.leaseToken !== leaseToken) return;
      entry.attempts += 1;
      entry.lastError = reason.slice(0, 500);
      entry.nextAttemptAt = new Date(Date.now() + backoffFor(entry.attempts)).toISOString();
      entry.leaseToken = null;
      entry.leaseUntil = null;
    });
  }

  async releaseLease(id: string, leaseToken?: string | null) {
    return this.mutate(id, (entry) => {
      if (leaseToken && entry.leaseToken !== leaseToken) return;
      entry.leaseToken = null;
      entry.leaseUntil = null;
    });
  }

  async reject(id: string, reason: string, leaseToken?: string | null) {
    const entry = await this.readEntry(id);
    if (!entry || (leaseToken && entry.leaseToken !== leaseToken)) return false;
    // 4xx causado por incompatibilidade de versão não pode apagar evidência.
    // Mantemos o item durável e o espaçamos; uma atualização do backend/Agent
    // poderá reenviá-lo sem recuperar nada do RTSP.
    this.state.rejected += 1;
    await this.saveState();
    await this.mutate(id, (persisted) => {
      persisted.attempts += 1;
      persisted.lastError = `server_rejected:${reason}`.slice(0, 500);
      persisted.nextAttemptAt = new Date(Date.now() + 60 * 60_000).toISOString();
      persisted.leaseToken = null;
      persisted.leaseUntil = null;
    });
    this.options.log(`Evento ${id} foi preservado após recusa do servidor e será tentado novamente.`);
    return true;
  }

  async prune() {
    this.assertReady();
    // Produção 1.0.2 não configura limites destrutivos. Este caminho só existe
    // para uma futura ação operacional explícita, nunca como política padrão.
    if (this.maxBytes === null && this.maxAgeMs === null) return;

    const now = Date.now();
    const entries: Array<{ id: string; createdAt: number; bytes: number }> = [];
    for (const id of await this.listIds()) {
      const entry = await this.readEntry(id);
      entries.push({ id, createdAt: entry ? Date.parse(entry.createdAt) : 0, bytes: await directorySize(path.join(this.root, id)) });
    }
    entries.sort((a, b) => a.createdAt - b.createdAt);
    let total = entries.reduce((sum, x) => sum + x.bytes, 0);
    let dropped = 0;
    for (const entry of entries) {
      const tooOld = this.maxAgeMs !== null && now - entry.createdAt > this.maxAgeMs;
      const tooBig = this.maxBytes !== null && total > this.maxBytes;
      if (!tooOld && !tooBig) break;
      await rm(path.join(this.root, entry.id), { recursive: true, force: true });
      total -= entry.bytes;
      dropped += 1;
    }
    if (dropped) {
      this.state.dropped += dropped;
      await this.saveState();
      this.options.log(`${dropped} evento(s) removido(s) por política operacional explícita.`);
    }
  }

  async stats(): Promise<QueueStats> {
    this.assertReady();
    const now = Date.now();
    let totalBytes = 0, readyNow = 0, leased = 0, pending = 0;
    let oldest: number | null = null;
    const cameras = new Set<string>();
    for (const id of await this.listIds()) {
      const entry = await this.readEntry(id);
      if (!entry) continue;
      pending += 1;
      cameras.add(entry.event.cameraId);
      totalBytes += await directorySize(path.join(this.root, id));
      if (entry.leaseUntil && Date.parse(entry.leaseUntil) > now) leased += 1;
      else if (Date.parse(entry.nextAttemptAt) <= now) readyNow += 1;
      const created = Date.parse(entry.createdAt);
      if (oldest === null || created < oldest) oldest = created;
    }
    return {
      pending,
      readyNow,
      leased,
      totalBytes,
      oldestCreatedAt: oldest === null ? null : new Date(oldest).toISOString(),
      oldestAgeSeconds: oldest === null ? 0 : Math.max(0, Math.floor((now - oldest) / 1000)),
      camerasPending: cameras.size,
      dropped: this.state.dropped,
      rejected: this.state.rejected,
      completed: this.state.completed,
    };
  }
}
