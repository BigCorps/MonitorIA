import { mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePaths, writeFileAtomic } from "./paths.js";
import type { LocalEventFrame, LocalMotionEvent } from "./types.js";

/**
 * Fila persistente de eventos.
 *
 * Substitui a fila em memória, que tinha três defeitos fatais para produção:
 * descartava o evento quando passava de 10 itens, perdia tudo no reinício do
 * computador, e desistia de vez após 3 tentativas. Numa loja com internet
 * instável — o caso comum — isso significa evento de segurança perdido sem
 * ninguém saber.
 *
 * Layout em disco:
 *
 *   queue/
 *     state.json              contadores de descarte e rejeição
 *     <eventId>/              entrada confirmada
 *       event.json            metadados + estado de tentativa
 *       frames/00.jpg ...     quadros, movidos para cá na entrada
 *     <eventId>.staging/      entrada em construção, ignorada na varredura
 *
 * A confirmação é o rename do diretório .staging, que é atômico no NTFS.
 * Uma queda de energia no meio da gravação deixa lixo em .staging, nunca
 * uma entrada pela metade.
 */

const STATE_FILE = "state.json";
const STAGING_SUFFIX = ".staging";
const EVENT_FILE = "event.json";
const FRAMES_DIRECTORY = "frames";

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O backoff cresce e satura em 15 minutos. Não existe número máximo de
 * tentativas para falha transitória: uma loja pode ficar dois dias sem
 * internet, e desistir seria exatamente o comportamento que estamos
 * corrigindo. O limite é de disco e de idade, não de tentativas.
 */
const BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 300_000, 900_000];

export type QueuedEntry = {
  id: string;
  event: LocalMotionEvent;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string | null;
};

type PersistedEntry = {
  version: 1;
  event: Omit<LocalMotionEvent, "frames"> & {
    frames: Array<Omit<LocalEventFrame, "frame"> & {
      frame: Omit<LocalEventFrame["frame"], "path"> & { file: string };
    }>;
  };
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string | null;
};

type QueueState = {
  version: 1;
  /** Eventos apagados por teto de disco ou idade. Perda de dado real. */
  dropped: number;
  /** Eventos recusados definitivamente pelo servidor (4xx permanente). */
  rejected: number;
};

export type QueueStats = {
  pending: number;
  readyNow: number;
  totalBytes: number;
  oldestCreatedAt: string | null;
  dropped: number;
  rejected: number;
};

function backoffFor(attempts: number) {
  const index = Math.min(attempts, BACKOFF_STEPS_MS.length - 1);
  return BACKOFF_STEPS_MS[index] ?? 900_000;
}

async function directorySize(target: string) {
  let total = 0;

  const walk = async (current: string) => {
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }

      try {
        total += (await stat(full)).size;
      } catch {
        // Arquivo removido em paralelo; ignora.
      }
    }
  };

  await walk(target);
  return total;
}

export class PersistentEventQueue {
  private root = "";
  private stateFile = "";
  private state: QueueState = { version: 1, dropped: 0, rejected: 0 };
  private ready = false;

  constructor(
    private readonly options: {
      log: (message: string) => void;
      maxBytes?: number;
      maxAgeMs?: number;
    },
  ) {}

  private get maxBytes() {
    return this.options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  private get maxAgeMs() {
    return this.options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  }

  /**
   * Prepara a fila e limpa restos de gravação interrompida.
   * Precisa ser chamado antes de qualquer outra operação.
   */
  async open() {
    if (this.ready) return;

    const layout = await resolvePaths();
    this.root = layout.queueDirectory;
    this.stateFile = path.join(this.root, STATE_FILE);

    await mkdir(this.root, { recursive: true });

    try {
      const parsed: unknown = JSON.parse(await readFile(this.stateFile, "utf8"));

      if (parsed && typeof parsed === "object") {
        const candidate = parsed as Partial<QueueState>;
        this.state = {
          version: 1,
          dropped: typeof candidate.dropped === "number" ? candidate.dropped : 0,
          rejected: typeof candidate.rejected === "number" ? candidate.rejected : 0,
        };
      }
    } catch {
      // Sem estado anterior é o caso da primeira execução.
    }

    let abandoned = 0;

    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(STAGING_SUFFIX)) continue;
      await rm(path.join(this.root, entry.name), { recursive: true, force: true });
      abandoned += 1;
    }

    if (abandoned > 0) {
      this.options.log(
        `Removidas ${abandoned} gravação(ões) interrompida(s) da fila no início.`,
      );
    }

    this.ready = true;
    await this.prune();
  }

  private assertReady() {
    if (!this.ready) throw new Error("A fila de eventos não foi inicializada.");
  }

  private async saveState() {
    await writeFileAtomic(this.stateFile, `${JSON.stringify(this.state, null, 2)}\n`);
  }

  /**
   * Grava o evento e assume a posse dos quadros.
   *
   * Os arquivos de quadro são movidos de frames/ para dentro da entrada. O
   * rename é barato e no mesmo volume, então não há cópia de 3 MB por evento.
   */
  async enqueue(event: LocalMotionEvent) {
    this.assertReady();

    const staging = path.join(this.root, `${event.eventId}${STAGING_SUFFIX}`);
    const framesDirectory = path.join(staging, FRAMES_DIRECTORY);

    try {
      await mkdir(framesDirectory, { recursive: true });

      const frames: PersistedEntry["event"]["frames"] = [];

      for (const [index, item] of event.frames.entries()) {
        const extension = path.extname(item.frame.path) || ".jpg";
        const file = `${String(index).padStart(2, "0")}${extension}`;

        await rename(item.frame.path, path.join(framesDirectory, file));

        const { path: _discarded, ...rest } = item.frame;
        frames.push({ label: item.label, frame: { ...rest, file } });
      }

      const now = new Date().toISOString();
      const { frames: _originalFrames, ...eventRest } = event;

      const persisted: PersistedEntry = {
        version: 1,
        event: { ...eventRest, frames },
        attempts: 0,
        createdAt: now,
        nextAttemptAt: now,
        lastError: null,
      };

      await writeFileAtomic(
        path.join(staging, EVENT_FILE),
        `${JSON.stringify(persisted, null, 2)}\n`,
      );

      await rename(staging, path.join(this.root, event.eventId));
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }

    await this.prune();
    return true;
  }

  private async readEntry(id: string): Promise<QueuedEntry | null> {
    const directory = path.join(this.root, id);

    let persisted: PersistedEntry;

    try {
      persisted = JSON.parse(
        await readFile(path.join(directory, EVENT_FILE), "utf8"),
      ) as PersistedEntry;
    } catch {
      return null;
    }

    const frames: LocalEventFrame[] = persisted.event.frames.map((item) => {
      const { file, ...frameRest } = item.frame;
      return {
        label: item.label,
        frame: { ...frameRest, path: path.join(directory, FRAMES_DIRECTORY, file) },
      };
    });

    return {
      id,
      event: { ...persisted.event, frames },
      attempts: persisted.attempts,
      createdAt: persisted.createdAt,
      nextAttemptAt: persisted.nextAttemptAt,
      lastError: persisted.lastError,
    };
  }

  private async listIds() {
    this.assertReady();

    const entries = await readdir(this.root, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.endsWith(STAGING_SUFFIX))
      .map((entry) => entry.name);
  }

  /** Entrada mais antiga cujo tempo de espera já passou. */
  async next(): Promise<QueuedEntry | null> {
    const candidates: QueuedEntry[] = [];
    const now = Date.now();

    for (const id of await this.listIds()) {
      const entry = await this.readEntry(id);
      if (!entry) continue;
      if (Date.parse(entry.nextAttemptAt) > now) continue;
      candidates.push(entry);
    }

    candidates.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return candidates[0] ?? null;
  }

  /** Envio bem-sucedido: apaga a entrada e os quadros. */
  async complete(id: string) {
    await rm(path.join(this.root, id), { recursive: true, force: true });
  }

  /** Falha transitória: agenda nova tentativa com backoff. */
  async defer(id: string, reason: string) {
    const directory = path.join(this.root, id);
    const file = path.join(directory, EVENT_FILE);

    let persisted: PersistedEntry;

    try {
      persisted = JSON.parse(await readFile(file, "utf8")) as PersistedEntry;
    } catch {
      return;
    }

    persisted.attempts += 1;
    persisted.lastError = reason.slice(0, 500);
    persisted.nextAttemptAt = new Date(
      Date.now() + backoffFor(persisted.attempts),
    ).toISOString();

    await writeFileAtomic(file, `${JSON.stringify(persisted, null, 2)}\n`);
  }

  /**
   * Falha definitiva: o servidor recusou o evento e repetir não muda nada.
   * A entrada sai da fila e o contador de rejeição sobe, para o painel poder
   * mostrar que houve descarte em vez de silenciar.
   */
  async reject(id: string, reason: string) {
    this.options.log(`Evento ${id} recusado definitivamente: ${reason}`);
    await rm(path.join(this.root, id), { recursive: true, force: true });
    this.state.rejected += 1;
    await this.saveState();
  }

  /**
   * Aplica o teto de disco e de idade, apagando as entradas mais antigas.
   *
   * Descartar é perda de dado e é contabilizado como tal. A alternativa —
   * encher o disco da loja — deixaria o Windows instável e derrubaria o
   * serviço inteiro, então o descarte controlado é o menor dos males.
   */
  async prune() {
    this.assertReady();

    const now = Date.now();
    const entries: Array<{ id: string; createdAt: number; bytes: number }> = [];

    for (const id of await this.listIds()) {
      const directory = path.join(this.root, id);
      const entry = await this.readEntry(id);

      entries.push({
        id,
        createdAt: entry ? Date.parse(entry.createdAt) : 0,
        bytes: await directorySize(directory),
      });
    }

    entries.sort((a, b) => a.createdAt - b.createdAt);

    let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    let dropped = 0;

    for (const entry of entries) {
      const tooOld = now - entry.createdAt > this.maxAgeMs;
      const tooBig = total > this.maxBytes;

      if (!tooOld && !tooBig) break;

      await rm(path.join(this.root, entry.id), { recursive: true, force: true });
      total -= entry.bytes;
      dropped += 1;
    }

    if (dropped > 0) {
      this.state.dropped += dropped;
      await this.saveState();
      this.options.log(
        `${dropped} evento(s) descartado(s) da fila por limite de disco ou idade.`,
      );
    }
  }

  async stats(): Promise<QueueStats> {
    this.assertReady();

    const now = Date.now();
    let totalBytes = 0;
    let readyNow = 0;
    let oldest: number | null = null;
    let pending = 0;

    for (const id of await this.listIds()) {
      const entry = await this.readEntry(id);
      if (!entry) continue;

      pending += 1;
      totalBytes += await directorySize(path.join(this.root, id));

      if (Date.parse(entry.nextAttemptAt) <= now) readyNow += 1;

      const created = Date.parse(entry.createdAt);
      if (oldest === null || created < oldest) oldest = created;
    }

    return {
      pending,
      readyNow,
      totalBytes,
      oldestCreatedAt: oldest === null ? null : new Date(oldest).toISOString(),
      dropped: this.state.dropped,
      rejected: this.state.rejected,
    };
  }
}
