import type {
  LocalEventFrame,
  LocalMotionEvent,
} from "../types.js";

const SOFT_EXPANSION_MS = 5_000;
const HARD_OUTLIER_MS = 30_000;
const MAX_EVENT_WINDOW_MS = 15 * 60_000;
const TIMELINE_TIMESTAMP_TOLERANCE_MS = 1_500;
const SEGMENT_TIMESTAMP_TOLERANCE_MS = 2_500;

type EvidenceWindowDiagnosticsV103 = {
  evidenceCoherenceVersion: 1;
  evidenceCanonicalStartAt: string;
  evidenceCanonicalEndAt: string;
  evidenceFrameWindowValid: true;
  evidenceTimelineCoherent: boolean;
  evidenceFrameOffsetsSeconds: Record<string, number>;
  evidenceDroppedOutOfWindowLabels: string[];
  evidenceExpandedStartMs: number;
  evidenceExpandedEndMs: number;
};

function finiteMs(value: unknown) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function timelineRecord(
  frame: LocalEventFrame["frame"],
) {
  const candidate = (
    frame as LocalEventFrame["frame"] & {
      timeline?: Record<string, unknown>;
    }
  ).timeline;

  return candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate)
    ? candidate
    : null;
}

function distanceFromWindow(
  value: number,
  startMs: number,
  endMs: number,
) {
  if (value < startMs) return startMs - value;
  if (value > endMs) return value - endMs;
  return 0;
}

function timelineCoherent(
  frame: LocalEventFrame,
) {
  const timeline = timelineRecord(frame.frame);
  if (!timeline) return false;

  const capturedMs = finiteMs(
    frame.frame.capturedAt,
  );
  const sourceMs = finiteMs(
    timeline.sourceTimestamp,
  );
  const segmentStartedMs = finiteMs(
    timeline.segmentStartedAt,
  );
  const offsetMs = Number(
    timeline.offsetMs ?? Number.NaN,
  );

  if (
    capturedMs === null ||
    sourceMs === null ||
    segmentStartedMs === null ||
    !Number.isFinite(offsetMs) ||
    offsetMs < 0
  ) {
    return false;
  }

  const sourceMatches =
    Math.abs(sourceMs - capturedMs) <=
    TIMELINE_TIMESTAMP_TOLERANCE_MS;

  const reconstructed =
    segmentStartedMs + offsetMs;
  const segmentMatches =
    Math.abs(reconstructed - capturedMs) <=
    SEGMENT_TIMESTAMP_TOLERANCE_MS;

  return sourceMatches && segmentMatches;
}

function uniqueLabels(
  frames: LocalEventFrame[],
) {
  const labels = new Set<string>();
  return frames.filter((frame) => {
    if (labels.has(frame.label)) {
      return false;
    }
    labels.add(frame.label);
    return true;
  });
}

function closestFrames(
  event: LocalMotionEvent,
  startMs: number,
  endMs: number,
) {
  return [...event.frames]
    .map((frame) => ({
      frame,
      capturedMs: finiteMs(
        frame.frame.capturedAt,
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        frame: LocalEventFrame;
        capturedMs: number;
      } => item.capturedMs !== null,
    )
    .sort(
      (left, right) =>
        distanceFromWindow(
          left.capturedMs,
          startMs,
          endMs,
        ) -
        distanceFromWindow(
          right.capturedMs,
          startMs,
          endMs,
        ),
    );
}

/**
 * Torna o intervalo do acontecimento a autoridade temporal compartilhada
 * entre JPEGs e vídeo.
 *
 * Regras:
 * - frame ligeiramente além da borda expande o acontecimento em até 5 s;
 * - outlier distante é removido da evidência em vez de ampliar um evento
 *   para um período que não representa a mesma ocorrência;
 * - o resultado sempre contém pelo menos uma imagem válida;
 * - todos os frames restantes ficam matematicamente dentro de
 *   startedAt..endedAt;
 * - o backend pedirá o vídeo usando esse mesmo intervalo canônico.
 */
export function canonicalizeEventEvidenceV103(
  event: LocalMotionEvent,
): LocalMotionEvent {
  const originalStartMs = finiteMs(
    event.startedAt,
  );
  const originalEndMs = finiteMs(
    event.endedAt,
  );

  if (
    originalStartMs === null ||
    originalEndMs === null ||
    originalEndMs < originalStartMs ||
    originalEndMs - originalStartMs >
      MAX_EVENT_WINDOW_MS
  ) {
    throw new Error(
      "v103_invalid_event_window",
    );
  }

  const candidates = closestFrames(
    event,
    originalStartMs,
    originalEndMs,
  );

  if (!candidates.length) {
    throw new Error(
      "v103_event_without_valid_frame_timestamp",
    );
  }

  const kept: Array<{
    frame: LocalEventFrame;
    capturedMs: number;
  }> = [];
  const dropped: string[] = [];

  for (const item of candidates) {
    const distance = distanceFromWindow(
      item.capturedMs,
      originalStartMs,
      originalEndMs,
    );

    if (distance <= SOFT_EXPANSION_MS) {
      kept.push(item);
      continue;
    }

    dropped.push(item.frame.label);
  }

  // Não perdemos silenciosamente o acontecimento caso todos os timestamps
  // estejam um pouco mais distantes por um bug de relógio/extração. Mantemos
  // o quadro mais próximo somente se ainda estiver dentro do limite rígido.
  if (!kept.length) {
    const nearest = candidates[0]!;
    const distance = distanceFromWindow(
      nearest.capturedMs,
      originalStartMs,
      originalEndMs,
    );

    if (distance > HARD_OUTLIER_MS) {
      throw new Error(
        "v103_evidence_temporally_unrecoverable",
      );
    }

    kept.push(nearest);
    const index = dropped.indexOf(
      nearest.frame.label,
    );
    if (index >= 0) dropped.splice(index, 1);
  }

  const unique = uniqueLabels(
    kept
      .sort(
        (left, right) =>
          left.capturedMs -
          right.capturedMs,
      )
      .map((item) => item.frame),
  );

  if (!unique.length) {
    throw new Error(
      "v103_event_without_unique_evidence",
    );
  }

  const frameTimes = unique.map(
    (frame) =>
      finiteMs(frame.frame.capturedAt)!,
  );
  const earliestFrameMs = Math.min(
    ...frameTimes,
  );
  const latestFrameMs = Math.max(
    ...frameTimes,
  );

  const canonicalStartMs = Math.min(
    originalStartMs,
    earliestFrameMs,
  );
  const canonicalEndMs = Math.max(
    originalEndMs,
    latestFrameMs,
  );

  if (
    canonicalEndMs - canonicalStartMs >
    MAX_EVENT_WINDOW_MS
  ) {
    throw new Error(
      "v103_canonical_window_too_large",
    );
  }

  const canonicalStartAt =
    new Date(
      canonicalStartMs,
    ).toISOString();
  const canonicalEndAt =
    new Date(
      canonicalEndMs,
    ).toISOString();

  const offsets: Record<string, number> =
    {};
  for (const frame of unique) {
    const capturedMs =
      finiteMs(frame.frame.capturedAt)!;
    offsets[frame.label] = Number(
      (
        (capturedMs -
          canonicalStartMs) /
        1000
      ).toFixed(3),
    );
  }

  const diagnostics: EvidenceWindowDiagnosticsV103 =
    {
      evidenceCoherenceVersion: 1,
      evidenceCanonicalStartAt:
        canonicalStartAt,
      evidenceCanonicalEndAt:
        canonicalEndAt,
      evidenceFrameWindowValid: true,
      evidenceTimelineCoherent:
        unique.every(timelineCoherent),
      evidenceFrameOffsetsSeconds:
        offsets,
      evidenceDroppedOutOfWindowLabels:
        [...new Set(dropped)],
      evidenceExpandedStartMs:
        originalStartMs -
        canonicalStartMs,
      evidenceExpandedEndMs:
        canonicalEndMs -
        originalEndMs,
    };

  return {
    ...event,
    startedAt: canonicalStartAt,
    endedAt: canonicalEndAt,
    frames: unique,
    localMetrics: {
      ...event.localMetrics,
      ...diagnostics,
    } as LocalMotionEvent["localMetrics"],
  };
}

export function evidenceWindowContractV103(
  event: LocalMotionEvent,
) {
  const startMs = finiteMs(event.startedAt);
  const endMs = finiteMs(event.endedAt);

  if (
    startMs === null ||
    endMs === null ||
    endMs < startMs
  ) {
    return {
      valid: false,
      reason: "invalid_event_window",
    } as const;
  }

  const valid =
    event.frames.length > 0 &&
    event.frames.every((frame) => {
      const capturedMs = finiteMs(
        frame.frame.capturedAt,
      );
      return (
        capturedMs !== null &&
        capturedMs >= startMs &&
        capturedMs <= endMs
      );
    });

  return valid
    ? {
        valid: true,
        reason: "same_canonical_window",
      } as const
    : {
        valid: false,
        reason: "frame_outside_event_window",
      } as const;
}
