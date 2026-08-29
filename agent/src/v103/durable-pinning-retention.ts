import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

import { CircularClipBuffer } from "../clip-buffer.js";
import { resolvePaths, writeFileAtomic } from "../paths.js";
import { PersistentEventQueue } from "../queue.js";

const ACCEPTED_PIN_GRACE_MS = 7 * 24 * 60 * 60_000;
const ACCEPTED_MARKER = ".accepted.json";
const MANIFEST_FILE = "manifest.json";
const PINNING_SUFFIX = ".pinning";

let installed = false;
let preflight: Promise<void> | null = null;

type AcceptedMarkerV103 = {
  version: 1;
  eventId: string;
  acceptedAt: string;
};

type PinManifestV103 = {
  version: number;
  eventId: string;
  updatedAt: string;
  [key: string]: unknown;
};

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

async function directoryExists(target: string) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

async function readJson<T>(target: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch {
    return null;
  }
}

export function shouldRetainPinnedEventV103(options: {
  queuePending: boolean;
  acceptedAt?: string | null;
  nowMs?: number;
}) {
  if (options.queuePending) return true;

  const acceptedMs = Date.parse(String(options.acceptedAt ?? ""));
  if (!Number.isFinite(acceptedMs)) return false;

  const nowMs = Number.isFinite(options.nowMs)
    ? Number(options.nowMs)
    : Date.now();

  return (
    nowMs >= acceptedMs &&
    nowMs - acceptedMs <= ACCEPTED_PIN_GRACE_MS
  );
}

export function durablePinningRetentionContractV103() {
  return {
    queuePendingHasPriority: true,
    acceptedPinGraceMs: ACCEPTED_PIN_GRACE_MS,
    acceptedMarker: ACCEPTED_MARKER,
  } as const;
}

async function queuedEventCameraId(eventId: string) {
  const layout = await resolvePaths();
  const eventFile = path.join(
    layout.queueDirectory,
    safeId(eventId),
    "event.json",
  );
  const parsed = await readJson<{
    event?: { cameraId?: unknown };
  }>(eventFile);
  const cameraId = String(parsed?.event?.cameraId ?? "").trim();
  return cameraId || null;
}

async function markAcceptedPinningV103(
  eventId: string,
  cameraId: string,
) {
  const layout = await resolvePaths();
  const directory = path.join(
    layout.root,
    "event-video-evidence",
    safeId(cameraId),
    `${safeId(eventId)}${PINNING_SUFFIX}`,
  );

  if (!(await directoryExists(directory))) return;

  const marker: AcceptedMarkerV103 = {
    version: 1,
    eventId,
    acceptedAt: new Date().toISOString(),
  };

  await writeFileAtomic(
    path.join(directory, ACCEPTED_MARKER),
    `${JSON.stringify(marker, null, 2)}\n`,
  );
}

async function pendingQueueIds() {
  const layout = await resolvePaths();
  let entries;
  try {
    entries = await readdir(layout.queueDirectory, {
      withFileTypes: true,
    });
  } catch {
    return new Set<string>();
  }

  return new Set(
    entries
      .filter((entry) =>
        entry.isDirectory() &&
        !entry.name.endsWith(".staging")
      )
      .map((entry) => safeId(entry.name))
      .filter(Boolean),
  );
}

async function refreshDurablePinningBeforeRestoreV103() {
  const layout = await resolvePaths();
  const evidenceRoot = path.join(
    layout.root,
    "event-video-evidence",
  );
  const queued = await pendingQueueIds();
  const nowIso = new Date().toISOString();

  let cameras;
  try {
    cameras = await readdir(evidenceRoot, {
      withFileTypes: true,
    });
  } catch {
    return;
  }

  for (const camera of cameras) {
    if (!camera.isDirectory()) continue;
    const cameraRoot = path.join(evidenceRoot, camera.name);
    let entries;
    try {
      entries = await readdir(cameraRoot, {
        withFileTypes: true,
      });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(PINNING_SUFFIX)) {
        continue;
      }

      const directory = path.join(cameraRoot, entry.name);
      const manifestPath = path.join(directory, MANIFEST_FILE);
      const manifest = await readJson<PinManifestV103>(manifestPath);
      const eventId = safeId(
        String(manifest?.eventId ?? entry.name.slice(0, -PINNING_SUFFIX.length)),
      );
      if (!manifest || !eventId || safeId(manifest.eventId) !== eventId) {
        continue;
      }

      const accepted = await readJson<AcceptedMarkerV103>(
        path.join(directory, ACCEPTED_MARKER),
      );
      const queuePending = queued.has(eventId);

      if (!shouldRetainPinnedEventV103({
        queuePending,
        acceptedAt: accepted?.acceptedAt ?? null,
      })) {
        continue;
      }

      // O restore do early-pinning remove somente manifestos antigos. Tocar
      // updatedAt aqui transforma a fila/ack durável no relógio de retenção,
      // em vez de um TTL arbitrário iniciado quando o movimento aconteceu.
      manifest.updatedAt = nowIso;
      await writeFileAtomic(
        manifestPath,
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }
  }
}

function ensurePreflightV103() {
  if (!preflight) {
    preflight = refreshDurablePinningBeforeRestoreV103()
      .catch(() => undefined);
  }
  return preflight;
}

export function installV103DurablePinningRetention() {
  if (installed) return;
  installed = true;

  const queueProto = PersistentEventQueue.prototype as any;
  const bufferProto = CircularClipBuffer.prototype as any;
  const originalComplete = queueProto.complete;
  const originalBufferStart = bufferProto.start;

  if (
    typeof originalComplete !== "function" ||
    typeof originalBufferStart !== "function"
  ) {
    throw new Error(
      "monitoria_v103_durable_pinning_contract_mismatch",
    );
  }

  queueProto.complete = async function (
    this: PersistentEventQueue,
    eventId: string,
    leaseToken?: string | null,
  ) {
    const cameraId = await queuedEventCameraId(eventId)
      .catch(() => null);
    const completed = await originalComplete.call(
      this,
      eventId,
      leaseToken,
    );

    if (completed && cameraId) {
      void markAcceptedPinningV103(eventId, cameraId)
        .catch((error) => {
          const logger = (this as any)?.options?.log;
          if (typeof logger === "function") {
            logger(
              `A proteção de vídeo ${eventId} continuará pelo TTL padrão: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        });
    }

    return completed;
  };

  // Deve ser instalado ANTES do early-evidence-pinning. O wrapper de pinning
  // chamará este start primeiro; assim manifestos duráveis são renovados antes
  // de restorePinnedProtection decidir se um diretório é antigo.
  bufferProto.start = async function (
    this: CircularClipBuffer,
    ...args: unknown[]
  ) {
    await ensurePreflightV103();
    return originalBufferStart.apply(this, args);
  };
}
