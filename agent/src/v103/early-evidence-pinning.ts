import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { CircularClipBuffer } from "../clip-buffer.js";
import {
  CameraTimeline,
  type TimelineBuiltClip,
  type TimelineClipRequest,
} from "../v102/timeline.js";
import { protectVideoFiles } from "../v102/disk-budget.js";

type TimelineSegmentLike = {
  path: string;
  name: string;
  bytes: number;
  modifiedAt: number;
  startedAt: number;
};

type PinnedSegment = {
  file: string;
  name: string;
  bytes: number;
  modifiedAt: number;
  startedAt: number;
};

type PinManifestV103 = {
  version: 1;
  eventId: string;
  startedAt: string;
  endedAt: string | null;
  lastPinnedAt: string;
  updatedAt: string;
  segments: PinnedSegment[];
};

type PinSession = {
  eventId: string;
  startedAt: string;
  endedAt: string | null;
  directory: string;
  manifestPath: string;
  copied: Map<string, PinnedSegment>;
  releases: Map<string, () => void>;
  chain: Promise<void>;
  periodicTimer: NodeJS.Timeout | null;
  expiryTimer: NodeJS.Timeout | null;
};

const PIN_INTERVAL_MS = 4_000;
const PIN_KEEP_MS = 2 * 60 * 60_000;
const STALE_DELETE_MS = 24 * 60 * 60_000;
const SEGMENT_MARGIN_MS = 5_000;

const eligibleTimelines = new WeakSet<CameraTimeline>();
const sessionsByTimeline =
  new WeakMap<CameraTimeline, Map<string, PinSession>>();
const restoredReleases =
  new WeakMap<CameraTimeline, Map<string, Array<() => void>>>();

let installed = false;

function safeId(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, "");
}

function timelineLog(
  timeline: CameraTimeline,
  message: string,
) {
  const logger = (timeline as any)?.options?.log;
  if (typeof logger === "function") {
    logger(message);
  }
}

function sessionMap(timeline: CameraTimeline) {
  let map = sessionsByTimeline.get(timeline);
  if (!map) {
    map = new Map<string, PinSession>();
    sessionsByTimeline.set(timeline, map);
  }
  return map;
}

function evidenceRoot(timeline: CameraTimeline) {
  return String(
    (timeline as any).evidenceRoot ?? "",
  );
}

function pinDirectory(
  timeline: CameraTimeline,
  eventId: string,
) {
  const root = evidenceRoot(timeline);
  if (!root) {
    throw new Error(
      "v103_evidence_root_unavailable",
    );
  }
  return path.join(
    root,
    `${safeId(eventId)}.pinning`,
  );
}

export function parseEvidenceCapturePrefixV103(
  prefix: string | null | undefined,
) {
  const text = String(prefix ?? "");
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-v103-structural)?-(start|peak|extra|end)$/i.exec(
    text,
  );

  if (!match) return null;

  return {
    eventId: String(match[1]).toLowerCase(),
    label: String(match[2]).toLowerCase() as
      | "start"
      | "peak"
      | "extra"
      | "end",
  };
}

export function segmentBelongsToEventWindowV103(
  segment: {
    startedAt: number;
    modifiedAt: number;
  },
  startMs: number,
  endMs: number,
) {
  return (
    segment.modifiedAt >=
      startMs - SEGMENT_MARGIN_MS &&
    segment.startedAt <=
      endMs + SEGMENT_MARGIN_MS
  );
}

async function atomicJson(
  filePath: string,
  value: unknown,
) {
  const temporary = `${filePath}.tmp`;
  await writeFile(
    temporary,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await rename(temporary, filePath);
}

function manifestFromSession(
  session: PinSession,
  lastPinnedAt: string,
): PinManifestV103 {
  return {
    version: 1,
    eventId: session.eventId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lastPinnedAt,
    updatedAt: new Date().toISOString(),
    segments: [...session.copied.values()].sort(
      (left, right) =>
        left.startedAt - right.startedAt,
    ),
  };
}

async function timelineSegments(
  timeline: CameraTimeline,
) {
  const method = (timeline as any).segments;
  if (typeof method !== "function") {
    throw new Error(
      "v103_timeline_segments_contract_missing",
    );
  }

  const segments =
    (await method.call(timeline)) as
      | TimelineSegmentLike[]
      | undefined;

  return Array.isArray(segments)
    ? segments
    : [];
}

function scheduleExpiry(
  timeline: CameraTimeline,
  session: PinSession,
) {
  if (session.expiryTimer) {
    clearTimeout(session.expiryTimer);
  }

  session.expiryTimer = setTimeout(() => {
    void releaseSession(
      timeline,
      session.eventId,
      false,
    );
  }, PIN_KEEP_MS);
  session.expiryTimer.unref?.();
}

async function createSession(
  timeline: CameraTimeline,
  eventId: string,
  startedAt: string,
) {
  const map = sessionMap(timeline);
  const existing = map.get(eventId);
  if (existing) return existing;

  const directory = pinDirectory(
    timeline,
    eventId,
  );
  await mkdir(directory, {
    recursive: true,
  });

  const session: PinSession = {
    eventId,
    startedAt,
    endedAt: null,
    directory,
    manifestPath: path.join(
      directory,
      "manifest.json",
    ),
    copied: new Map(),
    releases: new Map(),
    chain: Promise.resolve(),
    periodicTimer: null,
    expiryTimer: null,
  };

  map.set(eventId, session);
  scheduleExpiry(timeline, session);

  session.periodicTimer = setInterval(() => {
    if (session.endedAt) return;
    void queuePin(
      timeline,
      session,
      new Date().toISOString(),
    );
  }, PIN_INTERVAL_MS);
  session.periodicTimer.unref?.();

  await atomicJson(
    session.manifestPath,
    manifestFromSession(
      session,
      startedAt,
    ),
  );

  timelineLog(
    timeline,
    `Proteção antecipada 1.0.3 iniciada para o acontecimento ${eventId}.`,
  );

  return session;
}

async function pinThrough(
  timeline: CameraTimeline,
  session: PinSession,
  throughAt: string,
) {
  const startMs =
    Date.parse(session.startedAt);
  const throughMs =
    Date.parse(throughAt);

  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(throughMs)
  ) {
    return;
  }

  const segments =
    await timelineSegments(timeline);

  const selected = segments.filter(
    (segment) =>
      segmentBelongsToEventWindowV103(
        segment,
        startMs,
        throughMs,
      ),
  );

  for (const segment of selected) {
    const key = `${segment.startedAt}:${segment.name}`;
    if (session.copied.has(key)) continue;

    const destination = path.join(
      session.directory,
      path.basename(segment.name),
    );

    const releaseSource =
      protectVideoFiles([segment.path]);

    try {
      await copyFile(
        segment.path,
        destination,
      );
      const info = await stat(destination);

      const pinned: PinnedSegment = {
        file: path.basename(destination),
        name: segment.name,
        bytes: info.size,
        modifiedAt: segment.modifiedAt,
        startedAt: segment.startedAt,
      };

      session.copied.set(key, pinned);

      const releaseDestination =
        protectVideoFiles([destination]);
      session.releases.set(
        destination,
        releaseDestination,
      );
    } finally {
      releaseSource();
    }
  }

  await atomicJson(
    session.manifestPath,
    manifestFromSession(
      session,
      throughAt,
    ),
  );
}

function queuePin(
  timeline: CameraTimeline,
  session: PinSession,
  throughAt: string,
) {
  const task = session.chain
    .catch(() => undefined)
    .then(() =>
      pinThrough(
        timeline,
        session,
        throughAt,
      ),
    )
    .catch((error) => {
      timelineLog(
        timeline,
        `Proteção antecipada ${session.eventId} será tentada novamente: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    });

  session.chain = task;
  return task;
}

async function waitForPinnedCoverage(
  timeline: CameraTimeline,
  session: PinSession,
  targetAt: string,
) {
  const targetMs = Date.parse(targetAt);
  if (!Number.isFinite(targetMs)) return;

  const deadline =
    Date.now() +
    Math.max(
      5_000,
      Math.min(
        15_000,
        targetMs - Date.now() + 6_000,
      ),
    );

  do {
    await queuePin(
      timeline,
      session,
      targetAt,
    );

    const maximumModifiedAt = Math.max(
      0,
      ...[...session.copied.values()].map(
        (segment) => segment.modifiedAt,
      ),
    );

    if (
      maximumModifiedAt >=
      targetMs - 1_000
    ) {
      return;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 500),
    );
  } while (Date.now() < deadline);
}

function clipWindow(
  timeline: CameraTimeline,
  startedAt: string,
  endedAt: string,
  maxAllowedSeconds?: number | null,
) {
  const method = (timeline as any).clipWindow;
  if (typeof method === "function") {
    return method.call(
      timeline,
      startedAt,
      endedAt,
      maxAllowedSeconds,
    ) as {
      clipStartsAt: string;
      clipEndsAt: string;
      durationSeconds: number;
    };
  }

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  const eventSeconds =
    Number.isFinite(startMs) &&
    Number.isFinite(endMs) &&
    endMs > startMs
      ? (endMs - startMs) / 1000
      : 15;

  const ceiling =
    Number.isFinite(
      Number(maxAllowedSeconds),
    ) &&
    Number(maxAllowedSeconds) > 0
      ? Math.min(
          310,
          Math.floor(
            Number(maxAllowedSeconds),
          ),
        )
      : 310;

  const durationSeconds = Math.max(
    15,
    Math.min(
      ceiling,
      Math.ceil(3 + eventSeconds + 2),
    ),
  );

  return {
    clipStartsAt: new Date(
      startMs - 3_000,
    ).toISOString(),
    clipEndsAt: new Date(
      startMs -
        3_000 +
        durationSeconds * 1000,
    ).toISOString(),
    durationSeconds,
  };
}

async function readPinnedManifest(
  timeline: CameraTimeline,
  eventId: string,
) {
  const directory = pinDirectory(
    timeline,
    eventId,
  );
  const manifestPath = path.join(
    directory,
    "manifest.json",
  );

  try {
    const parsed = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PinManifestV103;

    if (
      parsed?.version !== 1 ||
      parsed.eventId !== eventId ||
      !Array.isArray(parsed.segments)
    ) {
      return null;
    }

    return {
      directory,
      manifest: parsed,
    };
  } catch {
    return null;
  }
}

async function buildFromPinnedSources(
  timeline: CameraTimeline,
  request: TimelineClipRequest,
): Promise<TimelineBuiltClip | null> {
  const loaded =
    await readPinnedManifest(
      timeline,
      request.eventId,
    );
  if (!loaded) return null;

  const startMs =
    Date.parse(request.clipStartsAt);
  const endMs =
    Date.parse(request.clipEndsAt);

  const selected: TimelineSegmentLike[] = [];

  for (const segment of loaded.manifest.segments) {
    if (
      !segmentBelongsToEventWindowV103(
        segment,
        startMs,
        endMs,
      )
    ) {
      continue;
    }

    const full = path.join(
      loaded.directory,
      path.basename(segment.file),
    );

    try {
      const info = await stat(full);
      if (info.size <= 0) continue;

      selected.push({
        path: full,
        name: segment.name,
        bytes: info.size,
        modifiedAt: segment.modifiedAt,
        startedAt: segment.startedAt,
      });
    } catch {
      // Uma cópia incompleta não invalida as outras.
    }
  }

  selected.sort(
    (left, right) =>
      left.startedAt - right.startedAt,
  );

  if (!selected.length) {
    return null;
  }

  const builder =
    (timeline as any).buildClipFromSegments;

  if (typeof builder !== "function") {
    throw new Error(
      "v103_build_clip_from_segments_contract_missing",
    );
  }

  timelineLog(
    timeline,
    `Gerando vídeo ${request.eventId} a partir de ${selected.length} segmento(s) fixados durante o acontecimento.`,
  );

  return builder.call(
    timeline,
    request,
    selected,
  ) as Promise<TimelineBuiltClip>;
}

async function releaseSession(
  timeline: CameraTimeline,
  eventId: string,
  removeDirectory: boolean,
) {
  const map = sessionsByTimeline.get(timeline);
  const session = map?.get(eventId);

  if (session) {
    if (session.periodicTimer) {
      clearInterval(session.periodicTimer);
      session.periodicTimer = null;
    }
    if (session.expiryTimer) {
      clearTimeout(session.expiryTimer);
      session.expiryTimer = null;
    }

    await session.chain.catch(
      () => undefined,
    );

    for (const release of session.releases.values()) {
      release();
    }
    session.releases.clear();

    map?.delete(eventId);
  }

  const restored =
    restoredReleases.get(timeline);
  const restoredForEvent =
    restored?.get(eventId);
  if (restoredForEvent) {
    for (const release of restoredForEvent) {
      release();
    }
    restored?.delete(eventId);
  }

  if (removeDirectory) {
    try {
      await rm(
        pinDirectory(timeline, eventId),
        {
          recursive: true,
          force: true,
        },
      );
    } catch {
      // Diretório já removido.
    }
  }
}

async function restorePinnedProtection(
  timeline: CameraTimeline,
) {
  const root = evidenceRoot(timeline);
  if (!root) return;

  let entries;
  try {
    entries = await readdir(root, {
      withFileTypes: true,
    });
  } catch {
    return;
  }

  const releases =
    restoredReleases.get(timeline) ??
    new Map<string, Array<() => void>>();
  restoredReleases.set(
    timeline,
    releases,
  );

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      !entry.name.endsWith(".pinning")
    ) {
      continue;
    }

    const eventId = entry.name.slice(
      0,
      -".pinning".length,
    );
    const directory = path.join(
      root,
      entry.name,
    );

    let manifest: PinManifestV103;
    try {
      manifest = JSON.parse(
        await readFile(
          path.join(
            directory,
            "manifest.json",
          ),
          "utf8",
        ),
      ) as PinManifestV103;
    } catch {
      continue;
    }

    const updatedAt =
      Date.parse(manifest.updatedAt);
    const ageMs = Number.isFinite(updatedAt)
      ? Date.now() - updatedAt
      : Number.POSITIVE_INFINITY;

    if (ageMs > STALE_DELETE_MS) {
      await rm(directory, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      continue;
    }

    if (ageMs > PIN_KEEP_MS) {
      continue;
    }

    const paths: string[] = [];
    for (const segment of manifest.segments ?? []) {
      const full = path.join(
        directory,
        path.basename(segment.file),
      );
      try {
        const info = await stat(full);
        if (info.size > 0) {
          paths.push(full);
        }
      } catch {
        // segmento ausente
      }
    }

    if (!paths.length) continue;

    const release =
      protectVideoFiles(paths);
    const current =
      releases.get(eventId) ?? [];
    current.push(release);
    releases.set(eventId, current);

    const timer = setTimeout(() => {
      release();
      const values =
        releases.get(eventId) ?? [];
      releases.set(
        eventId,
        values.filter(
          (item) => item !== release,
        ),
      );
    }, Math.max(1_000, PIN_KEEP_MS - ageMs));
    timer.unref?.();

    timelineLog(
      timeline,
      `Proteção de vídeo ${eventId} restaurada após reinício do Agent.`,
    );
  }
}

/**
 * 1.0.3: fixa segmentos enquanto o acontecimento está acontecendo.
 *
 * Não duplica o detector. O início/fim é inferido dos próprios captureAt
 * já realizados pelo monitor compartilhado. A 1.0.2 continua intocada,
 * pois estes wrappers só são instalados pelo entrypoint v1.0.3.
 */
export function installV103EarlyEvidencePinning() {
  if (installed) return;
  installed = true;

  const timelineProto =
    CameraTimeline.prototype as any;
  const bufferProto =
    CircularClipBuffer.prototype as any;

  const originalCaptureAt =
    timelineProto.captureAt;
  const originalPreserveEventClip =
    timelineProto.preserveEventClip;
  const originalBufferStart =
    bufferProto.start;
  const originalBufferBuildClip =
    bufferProto.buildClip;
  const originalBufferRemove =
    bufferProto.removePreservedClip;

  if (
    typeof originalCaptureAt !== "function" ||
    typeof originalPreserveEventClip !== "function" ||
    typeof originalBufferStart !== "function" ||
    typeof originalBufferBuildClip !== "function" ||
    typeof originalBufferRemove !== "function"
  ) {
    throw new Error(
      "monitoria_v103_early_pinning_contract_mismatch",
    );
  }

  timelineProto.captureAt =
    async function (
      this: CameraTimeline,
      targetAt: string,
      options: {
        maxWidth?: number;
        quality?: number;
        prefix?: string;
      } = {},
    ) {
      const frame =
        await originalCaptureAt.call(
          this,
          targetAt,
          options,
        );

      if (!eligibleTimelines.has(this)) {
        return frame;
      }

      const marker =
        parseEvidenceCapturePrefixV103(
          options.prefix,
        );
      if (!marker) return frame;

      let session =
        sessionMap(this).get(
          marker.eventId,
        );

      if (!session) {
        session = await createSession(
          this,
          marker.eventId,
          frame.capturedAt,
        );
      }

      if (marker.label === "end") {
        session.endedAt =
          frame.capturedAt;
        if (session.periodicTimer) {
          clearInterval(
            session.periodicTimer,
          );
          session.periodicTimer = null;
        }
      }

      // A primeira cópia é aguardada: a evidência entra no espaço protegido
      // antes que o processamento avance. Pico/extra também atualizam o pin.
      await queuePin(
        this,
        session,
        frame.capturedAt,
      );

      if (marker.label === "end") {
        const timer = setTimeout(() => {
          void queuePin(
            this,
            session!,
            new Date(
              Date.parse(frame.capturedAt) +
                4_000,
            ).toISOString(),
          );
        }, 4_500);
        timer.unref?.();
      }

      return frame;
    };

  timelineProto.preserveEventClip =
    async function (
      this: CameraTimeline,
      eventId: string,
      startedAt: string,
      endedAt: string,
      maxAllowedSeconds?: number | null,
    ) {
      if (eligibleTimelines.has(this)) {
        let session =
          sessionMap(this).get(eventId);

        if (!session) {
          session = await createSession(
            this,
            eventId,
            startedAt,
          );
        }

        session.endedAt = endedAt;
        if (session.periodicTimer) {
          clearInterval(
            session.periodicTimer,
          );
          session.periodicTimer = null;
        }

        const window = clipWindow(
          this,
          startedAt,
          endedAt,
          maxAllowedSeconds,
        );

        await waitForPinnedCoverage(
          this,
          session,
          window.clipEndsAt,
        );
      }

      // O builder homologado da 1.0.2 continua sendo a primeira escolha.
      // Se ele não conseguir cobrir o começo porque o ring foi podado,
      // as fontes .pinning permanecem para o worker da 1.0.3.
      return originalPreserveEventClip.call(
        this,
        eventId,
        startedAt,
        endedAt,
        maxAllowedSeconds,
      );
    };

  bufferProto.start =
    async function (
      this: CircularClipBuffer,
      ...args: unknown[]
    ) {
      const result =
        await originalBufferStart.apply(
          this,
          args,
        );

      const timeline = (this as any)
        .timeline as CameraTimeline | null;

      if (timeline) {
        eligibleTimelines.add(timeline);
        void restorePinnedProtection(
          timeline,
        );
      }

      return result;
    };

  bufferProto.buildClip =
    async function (
      this: CircularClipBuffer,
      request: TimelineClipRequest & {
        agentEventId?: string | null;
      },
    ) {
      const timeline = (this as any)
        .timeline as CameraTimeline | null;

      if (
        timeline &&
        request.agentEventId
      ) {
        const built =
          await buildFromPinnedSources(
            timeline,
            {
              requestId:
                request.requestId,
              eventId:
                request.eventId,
              clipStartsAt:
                request.clipStartsAt,
              clipEndsAt:
                request.clipEndsAt,
              durationSeconds:
                request.durationSeconds,
            },
          );

        if (built) return built;
      }

      return originalBufferBuildClip.call(
        this,
        request,
      );
    };

  bufferProto.removePreservedClip =
    async function (
      this: CircularClipBuffer,
      agentEventId: string,
    ) {
      const timeline = (this as any)
        .timeline as CameraTimeline | null;

      const result =
        await originalBufferRemove.call(
          this,
          agentEventId,
        );

      if (timeline) {
        await releaseSession(
          timeline,
          agentEventId,
          true,
        );
      }

      return result;
    };
}
