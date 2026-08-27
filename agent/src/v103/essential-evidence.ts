import { spawn } from "node:child_process";
import {
  mkdir,
  readFile,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

import type {
  LocalEventFrame,
  LocalMotionEvent,
} from "../types.js";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const SAFE_TOTAL_BYTES = 2_700_000;
const MIN_FRAME_BYTES = 1024;

type PreparedEssentialEvidenceV103 = {
  event: LocalMotionEvent;
  supersededPaths: string[];
};

function requiredLabels(
  event: LocalMotionEvent,
) {
  const raw = (
    event.localMetrics as
      | Record<string, unknown>
      | undefined
  )?.evidenceRequiredLabelsV103;

  return new Set(
    Array.isArray(raw)
      ? raw.map(String)
      : event.frames
          .filter(
            (frame) =>
              frame.label !== "extra",
          )
          .map((frame) => frame.label),
  );
}

export function v103BudgetForFrameCount(
  count: number,
) {
  const safe = Math.max(
    1,
    Math.min(4, Math.floor(count)),
  );
  return Math.min(
    MAX_FRAME_BYTES,
    Math.floor(SAFE_TOTAL_BYTES / safe),
  );
}

function run(
  executable: string,
  args: string[],
  timeoutMs = 45_000,
) {
  return new Promise<{
    code: number;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      executable,
      args,
      {
        stdio: [
          "ignore",
          "ignore",
          "pipe",
        ],
        windowsHide: true,
      },
    );

    let stderr = "";
    let timedOut = false;

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            "v103_evidence_reencode_timeout",
          ),
        );
        return;
      }
      resolve({
        code: code ?? -1,
        stderr,
      });
    });
  });
}

async function validPreparedFile(
  filePath: string,
  targetBytes: number,
) {
  try {
    const info = await stat(filePath);
    return (
      info.size >= MIN_FRAME_BYTES &&
      info.size <= targetBytes &&
      info.size <= MAX_FRAME_BYTES
    );
  } catch {
    return false;
  }
}

async function compressFrame(
  ffmpegPath: string,
  frame: LocalEventFrame,
  targetBytes: number,
) {
  const source = frame.frame.path;
  const output =
    `${source}.v103-budget.jpg`;

  if (
    await validPreparedFile(
      output,
      targetBytes,
    )
  ) {
    return output;
  }

  await rm(output, {
    force: true,
  }).catch(() => undefined);

  const widths = [
    1280,
    1120,
    960,
    800,
    640,
    560,
    480,
  ];
  const qualities = [
    5,
    7,
    9,
    11,
    13,
    15,
    17,
  ];

  await mkdir(
    path.dirname(output),
    { recursive: true },
  );

  for (const width of widths) {
    for (const quality of qualities) {
      await rm(output, {
        force: true,
      }).catch(() => undefined);

      const result = await run(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          source,
          "-frames:v",
          "1",
          "-an",
          "-vf",
          `scale=${width}:-2:force_original_aspect_ratio=decrease:out_range=full,format=yuvj420p`,
          "-c:v",
          "mjpeg",
          "-color_range",
          "pc",
          "-q:v",
          String(quality),
          "-update",
          "1",
          "-y",
          output,
        ],
      );

      if (result.code !== 0) {
        continue;
      }

      if (
        await validPreparedFile(
          output,
          targetBytes,
        )
      ) {
        return output;
      }
    }
  }

  await rm(output, {
    force: true,
  }).catch(() => undefined);
  return null;
}

async function frameBytes(
  filePath: string,
) {
  return (await stat(filePath)).size;
}

/**
 * Pré-orçamento exclusivo da 1.0.3.
 *
 * O uploader v2 continua igual, mas recebe arquivos que já obedecem ao mesmo
 * teto de 2,7 MB. Assim start/peak/end não desaparecem na etapa de redução
 * de payload. Se um quadro principal não puder ser preparado, lançamos erro
 * e a fila durável tentará novamente.
 */
export async function prepareEssentialEvidenceV103(
  ffmpegPath: string,
  event: LocalMotionEvent,
): Promise<PreparedEssentialEvidenceV103> {
  if (!event.frames.length) {
    throw new Error(
      "v103_event_without_visual_evidence",
    );
  }

  const targetBytes =
    v103BudgetForFrameCount(
      event.frames.length,
    );
  const required =
    requiredLabels(event);
  const frames: LocalEventFrame[] = [];
  const supersededPaths: string[] = [];
  const droppedOptional: string[] = [];

  for (const item of event.frames) {
    let size: number;
    try {
      size = await frameBytes(
        item.frame.path,
      );
    } catch {
      if (required.has(item.label)) {
        throw new Error(
          `v103_required_evidence_missing:${item.label}`,
        );
      }
      droppedOptional.push(item.label);
      continue;
    }

    if (
      size >= MIN_FRAME_BYTES &&
      size <= targetBytes &&
      size <= MAX_FRAME_BYTES
    ) {
      frames.push(item);
      continue;
    }

    const compressed =
      await compressFrame(
        ffmpegPath,
        item,
        targetBytes,
      );

    if (!compressed) {
      if (required.has(item.label)) {
        throw new Error(
          `v103_required_evidence_cannot_fit:${item.label}`,
        );
      }
      droppedOptional.push(item.label);
      continue;
    }

    frames.push({
      ...item,
      frame: {
        ...item.frame,
        path: compressed,
        byteSize:
          await frameBytes(compressed),
        width: null,
        height: null,
      },
    });
    supersededPaths.push(
      item.frame.path,
    );
  }

  const availableLabels = new Set(
    frames.map((frame) => frame.label),
  );

  for (const label of required) {
    if (!availableLabels.has(label as any)) {
      throw new Error(
        `v103_required_evidence_not_prepared:${label}`,
      );
    }
  }

  if (!frames.length) {
    throw new Error(
      "v103_no_evidence_after_budget",
    );
  }

  const totalBytes = (
    await Promise.all(
      frames.map((frame) =>
        frameBytes(frame.frame.path),
      ),
    )
  ).reduce(
    (sum, value) => sum + value,
    0,
  );

  if (totalBytes > SAFE_TOTAL_BYTES) {
    throw new Error(
      `v103_evidence_budget_exceeded:${totalBytes}`,
    );
  }

  return {
    event: {
      ...event,
      frames,
      localMetrics: {
        ...(event.localMetrics as Record<
          string,
          unknown
        >),
        evidencePreBudgetV103: true,
        evidencePreBudgetBytesV103:
          totalBytes,
        evidencePreBudgetTargetPerFrameV103:
          targetBytes,
        evidenceOptionalDroppedV103:
          droppedOptional,
      } as LocalMotionEvent["localMetrics"],
    },
    supersededPaths,
  };
}

/**
 * Remove somente as origens que foram substituídas DEPOIS que a fila durável
 * confirmou o commit. Nunca executar antes de queue.enqueue().
 */
export async function cleanupSupersededEvidenceV103(
  paths: string[],
) {
  await Promise.allSettled(
    [...new Set(paths)].map(
      (filePath) =>
        rm(filePath, {
          force: true,
        }),
    ),
  );
}
