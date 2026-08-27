import {
  PersistentEventQueue,
  type QueuedEntry,
} from "../queue.js";
import {
  priorityScoreV103,
} from "./event-priority.js";

let installed = false;

function createdAt(entry: QueuedEntry) {
  const value = Date.parse(
    entry.createdAt,
  );
  return Number.isFinite(value)
    ? value
    : 0;
}

export function prioritizeClaimedEntriesV103(
  entries: QueuedEntry[],
  limit: number,
) {
  const target = Math.max(
    1,
    Math.floor(limit),
  );

  const groups = new Map<
    number,
    Map<string, QueuedEntry[]>
  >();

  for (const entry of entries) {
    const priority =
      priorityScoreV103(entry.event);
    const byCamera =
      groups.get(priority) ??
      new Map<string, QueuedEntry[]>();

    const cameraEntries =
      byCamera.get(
        entry.event.cameraId,
      ) ?? [];
    cameraEntries.push(entry);
    byCamera.set(
      entry.event.cameraId,
      cameraEntries,
    );
    groups.set(priority, byCamera);
  }

  for (const byCamera of groups.values()) {
    for (const values of byCamera.values()) {
      values.sort(
        (left, right) =>
          createdAt(left) -
          createdAt(right),
      );
    }
  }

  const selected: QueuedEntry[] = [];

  for (
    const priority of [...groups.keys()].sort(
      (left, right) =>
        right - left,
    )
  ) {
    const byCamera =
      groups.get(priority)!;
    let cameras = [
      ...byCamera.keys(),
    ].sort();

    while (
      selected.length < target &&
      cameras.length
    ) {
      let progressed = false;

      for (const cameraId of cameras) {
        if (
          selected.length >= target
        ) {
          break;
        }

        const entry =
          byCamera.get(cameraId)?.shift();
        if (!entry) continue;

        selected.push(entry);
        progressed = true;
      }

      if (!progressed) break;

      cameras = cameras.filter(
        (cameraId) =>
          (
            byCamera.get(cameraId)
              ?.length ?? 0
          ) > 0,
      );
    }

    if (selected.length >= target) {
      break;
    }
  }

  return selected;
}

/**
 * A fila original continua fazendo fairness por câmera e lease persistente.
 * A 1.0.3 olha uma pequena janela maior de itens já elegíveis, prioriza os
 * críticos e devolve imediatamente os leases excedentes.
 */
export function installV103PriorityQueue() {
  if (installed) return;
  installed = true;

  const proto =
    PersistentEventQueue.prototype as any;
  const original =
    proto.claimFair;

  if (typeof original !== "function") {
    throw new Error(
      "monitoria_v103_claim_fair_contract_missing",
    );
  }

  proto.claimFair =
    async function (
      this: PersistentEventQueue,
      limit: number,
      leaseMs = 120_000,
    ) {
      const requested = Math.max(
        1,
        Math.floor(limit),
      );
      const expanded = Math.min(
        24,
        Math.max(
          requested,
          requested * 3,
        ),
      );

      const claimed =
        (await original.call(
          this,
          expanded,
          leaseMs,
        )) as QueuedEntry[];

      if (
        claimed.length <= requested
      ) {
        return prioritizeClaimedEntriesV103(
          claimed,
          requested,
        );
      }

      const selected =
        prioritizeClaimedEntriesV103(
          claimed,
          requested,
        );
      const selectedIds = new Set(
        selected.map(
          (entry) => entry.id,
        ),
      );

      await Promise.allSettled(
        claimed
          .filter(
            (entry) =>
              !selectedIds.has(
                entry.id,
              ),
          )
          .map((entry) =>
            this.releaseLease(
              entry.id,
              entry.leaseToken,
            ),
          ),
      );

      return selected;
    };
}
