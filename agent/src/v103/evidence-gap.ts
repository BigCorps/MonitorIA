import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import { ApiError } from "../api.js";
import {
  resolvePaths,
  writeFileAtomic,
} from "../paths.js";
import {
  GlobalVideoDiskBudget,
} from "../v102/disk-budget.js";
import {
  requestAgentJsonV102,
} from "../v102/api.js";
import {
  operationalMomentContext,
  type OperationalAccessConfigV103,
} from "./operational-config.js";

export type EvidenceGapDetectorV103 =
  | "regular_motion"
  | "structural_motion";

export type EvidenceGapPriorityV103 =
  | "critical"
  | "important"
  | "normal";

export type EvidenceGapV103 = {
  eventId: string;
  cameraId: string;
  cameraName: string;
  sessionId: string | null;
  startedAt: string;
  endedAt: string;
  detector: EvidenceGapDetectorV103;
  reason: "visual_evidence_unavailable";
  timePrecision: "detector_log_interval";
  priority: EvidenceGapPriorityV103;
  localMetrics: Record<string, unknown>;
};

type PersistedGapV103 = {
  version: 1;
  gap: EvidenceGapV103;
  attempts: number;
  createdAt: string;
  nextAttemptAt: string;
  lastError: string | null;
};

const BACKOFF_MS = [
  5_000,
  15_000,
  60_000,
  300_000,
  900_000,
];

function backoffFor(attempts: number) {
  return (
    BACKOFF_MS[
      Math.min(
        attempts,
        BACKOFF_MS.length - 1,
      )
    ] ?? 900_000
  );
}

function errorCode(error: unknown) {
  return error &&
    typeof error === "object" &&
    "code" in error
    ? String(
        (error as { code?: unknown })
          .code ?? "",
      )
    : "";
}

function safeId(value: string) {
  return value.replace(
    /[^a-zA-Z0-9-]/g,
    "",
  );
}

export class EvidenceGapQueueV103 {
  private root = "";
  private dataRoot = "";
  private opened = false;

  constructor(
    private readonly log: (
      message: string,
    ) => void,
  ) {}

  async open() {
    if (this.opened) return;
    const layout = await resolvePaths();
    this.dataRoot = layout.root;
    this.root = path.join(
      layout.root,
      "evidence-gaps",
    );
    await mkdir(this.root, {
      recursive: true,
    });
    this.opened = true;
  }

  private assertOpen() {
    if (!this.opened) {
      throw new Error(
        "v103_evidence_gap_queue_not_open",
      );
    }
  }

  private fileFor(eventId: string) {
    return path.join(
      this.root,
      `${safeId(eventId)}.json`,
    );
  }

  async enqueue(
    gap: EvidenceGapV103,
    pressureRecovered = false,
  ): Promise<boolean> {
    this.assertOpen();
    const file = this.fileFor(
      gap.eventId,
    );

    try {
      try {
        if ((await stat(file)).size > 0) {
          return true;
        }
      } catch {
        // novo gap
      }

      const now =
        new Date().toISOString();
      const persisted: PersistedGapV103 = {
        version: 1,
        gap,
        attempts: 0,
        createdAt: now,
        nextAttemptAt: now,
        lastError: null,
      };

      await writeFileAtomic(
        file,
        `${JSON.stringify(
          persisted,
          null,
          2,
        )}\n`,
      );

      this.log(
        `Lacuna de evidência ${gap.eventId} preservada localmente.`,
      );
      return true;
    } catch (error) {
      if (
        !pressureRecovered &&
        errorCode(error) === "ENOSPC" &&
        this.dataRoot
      ) {
        this.log(
          `Disco pressionado ao preservar lacuna ${gap.eventId}; liberando vídeo descartável antes de repetir.`,
        );
        await new GlobalVideoDiskBudget(
          this.dataRoot,
        ).releaseForEventPressure();

        return this.enqueue(
          gap,
          true,
        );
      }

      throw error;
    }
  }

  private async read(
    file: string,
  ): Promise<PersistedGapV103 | null> {
    try {
      const parsed = JSON.parse(
        await readFile(file, "utf8"),
      ) as PersistedGapV103;

      if (
        parsed?.version !== 1 ||
        !parsed.gap?.eventId
      ) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  async ready(
    limit = 4,
  ): Promise<
    Array<{
      file: string;
      persisted: PersistedGapV103;
    }>
  > {
    this.assertOpen();

    const now = Date.now();
    const result: Array<{
      file: string;
      persisted: PersistedGapV103;
    }> = [];

    for (const entry of await readdir(
      this.root,
      { withFileTypes: true },
    )) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }

      const file = path.join(
        this.root,
        entry.name,
      );
      const persisted =
        await this.read(file);
      if (!persisted) continue;

      if (
        Date.parse(
          persisted.nextAttemptAt,
        ) > now
      ) {
        continue;
      }

      result.push({
        file,
        persisted,
      });
    }

    result.sort(
      (left, right) =>
        Date.parse(
          left.persisted.createdAt,
        ) -
        Date.parse(
          right.persisted.createdAt,
        ),
    );

    return result.slice(
      0,
      Math.max(1, limit),
    );
  }

  async complete(file: string) {
    await rm(file, {
      force: true,
    });
  }

  async defer(
    file: string,
    persisted: PersistedGapV103,
    error: unknown,
  ) {
    const attempts =
      Number(
        persisted.attempts ?? 0,
      ) + 1;
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    await writeFileAtomic(
      file,
      `${JSON.stringify(
        {
          ...persisted,
          attempts,
          nextAttemptAt:
            new Date(
              Date.now() +
                backoffFor(attempts),
            ).toISOString(),
          lastError:
            message.slice(0, 500),
        } satisfies PersistedGapV103,
        null,
        2,
      )}\n`,
    );
  }

  async stats() {
    this.assertOpen();

    let pending = 0;
    let oldest: number | null = null;

    for (const entry of await readdir(
      this.root,
      { withFileTypes: true },
    )) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }

      const file = path.join(
        this.root,
        entry.name,
      );
      const persisted =
        await this.read(file);
      if (!persisted) continue;

      pending += 1;
      const created = Date.parse(
        persisted.createdAt,
      );
      if (
        Number.isFinite(created) &&
        (
          oldest === null ||
          created < oldest
        )
      ) {
        oldest = created;
      }
    }

    return {
      pending,
      oldestCreatedAt:
        oldest === null
          ? null
          : new Date(
              oldest,
            ).toISOString(),
      oldestAgeSeconds:
        oldest === null
          ? 0
          : Math.max(
              0,
              Math.floor(
                (Date.now() - oldest) /
                  1000,
              ),
            ),
    };
  }
}

function priorityFor(
  detector: EvidenceGapDetectorV103,
  operational:
    | OperationalAccessConfigV103
    | null
    | undefined,
  now: Date,
  timezone: string,
): EvidenceGapPriorityV103 {
  const context =
    operationalMomentContext(
      operational,
      now,
      timezone,
    );

  if (
    operational?.enabled &&
    (
      detector ===
        "structural_motion" ||
      context.outsideDeclaredHours
    )
  ) {
    return "critical";
  }

  if (operational?.enabled) {
    return "important";
  }

  return "normal";
}

type TrackerOptions = {
  cameraId: string;
  cameraName: string;
  sessionId: string | null;
  timezone: string;
  operationalAccess:
    | OperationalAccessConfigV103
    | null;
  record: (
    gap: EvidenceGapV103,
  ) => Promise<boolean>;
  log: (message: string) => void;
  now?: () => Date;
};

/**
 * Compatibilidade sem alterar o detector 1.0.2:
 *
 * O monitor regular já registra no log o início do movimento e o UUID quando
 * não consegue extrair nenhum JPEG. O detector estrutural 1.0.3 faz o mesmo.
 * Este tracker transforma esses dois sinais em uma fila durável.
 *
 * O horário é explicitamente "detector_log_interval": ele não é vendido como
 * transição visual exata.
 */
export function createEvidenceGapTrackerV103(
  options: TrackerOptions,
) {
  const now =
    options.now ??
    (() => new Date());

  let regularStartedAt:
    | string
    | null = null;
  let structuralStartedAt:
    | string
    | null = null;

  const persist = (
    eventId: string,
    detector: EvidenceGapDetectorV103,
    startedAt: string | null,
  ) => {
    const ended = now();
    const endedAt =
      ended.toISOString();
    const safeStartedAt =
      startedAt &&
      Date.parse(startedAt) <=
        ended.getTime()
        ? startedAt
        : endedAt;

    const context =
      operationalMomentContext(
        options.operationalAccess,
        ended,
        options.timezone,
      );

    const gap: EvidenceGapV103 = {
      eventId:
        eventId.toLowerCase(),
      cameraId:
        options.cameraId,
      cameraName:
        options.cameraName,
      sessionId:
        options.sessionId,
      startedAt:
        safeStartedAt,
      endedAt,
      detector,
      reason:
        "visual_evidence_unavailable",
      timePrecision:
        "detector_log_interval",
      priority: priorityFor(
        detector,
        options.operationalAccess,
        ended,
        options.timezone,
      ),
      localMetrics: {
        evidenceGapVersion: 1,
        detector,
        operationalAccessEnabled:
          options.operationalAccess
            ?.enabled === true,
        outsideDeclaredHours:
          context.outsideDeclaredHours,
        operationalPeriod:
          context.operationalPeriod,
        nearOperationalTransitionWindow:
          context
            .nearOperationalTransitionWindow,
        evidenceGapTimeApproximate:
          true,
      },
    };

    void options
      .record(gap)
      .catch((error) => {
        options.log(
          `Falha ao persistir lacuna ${eventId}; o Agent tentará novamente pelo fluxo local: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      });
  };

  return {
    observe(message: string) {
      if (
        message.startsWith(
          "Movimento iniciado em ",
        )
      ) {
        regularStartedAt =
          now().toISOString();
        return;
      }

      if (
        message.startsWith(
          "Mudança estrutural lenta iniciada em ",
        )
      ) {
        structuralStartedAt =
          now().toISOString();
        return;
      }

      const regular =
        /Evento local ([0-9a-f-]{36}) preservado sem envio porque nenhum quadro da timeline ficou disponível\./i.exec(
          message,
        );

      if (regular?.[1]) {
        persist(
          regular[1],
          "regular_motion",
          regularStartedAt,
        );
        regularStartedAt = null;
        return;
      }

      const structural =
        /Mudança estrutural ([0-9a-f-]{36}) ficou sem quadro utilizável/i.exec(
          message,
        );

      if (structural?.[1]) {
        persist(
          structural[1],
          "structural_motion",
          structuralStartedAt,
        );
        structuralStartedAt =
          null;
      }
    },
  };
}

export async function submitEvidenceGapV103(
  apiBaseUrl: string,
  token: string,
  gap: EvidenceGapV103,
) {
  return requestAgentJsonV102<{
    ok: true;
    duplicate: boolean;
    gapId: string;
  }>(
    apiBaseUrl,
    token,
    `/api/agent/v103/cameras/${encodeURIComponent(
      gap.cameraId,
    )}/evidence-gaps`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
      },
      body: JSON.stringify(gap),
    },
    30_000,
  );
}

export async function flushEvidenceGapsV103(
  service: any,
) {
  if (
    service.__v103EvidenceGapFlushBusy ||
    service.shuttingDown ||
    service.unauthorized
  ) {
    return;
  }

  const queue = service
    .__v103EvidenceGapQueue as
    | EvidenceGapQueueV103
    | undefined;
  const config = service.config;
  const token = service.token;

  if (!queue || !config || !token) {
    return;
  }

  service.__v103EvidenceGapFlushBusy =
    true;

  try {
    for (const item of await queue.ready(
      4,
    )) {
      try {
        await submitEvidenceGapV103(
          config.apiBaseUrl,
          token,
          item.persisted.gap,
        );
        await queue.complete(
          item.file,
        );
        service.logger.info(
          `Lacuna de evidência ${item.persisted.gap.eventId} entregue ao backend.`,
        );
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401
        ) {
          service.handleUnauthorized();
          return;
        }

        await queue.defer(
          item.file,
          item.persisted,
          error,
        );
      }
    }
  } finally {
    service.__v103EvidenceGapFlushBusy =
      false;
  }
}
