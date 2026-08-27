import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import { CircularClipBuffer } from "../clip-buffer.js";
import { resolveFfprobe } from "../discovery/binaries.js";

export type ClipIntegrityAssessmentV103 = {
  expectedDurationSeconds: number;
  actualDurationSeconds: number;
  coverageRatio: number;
  toleranceSeconds: number;
  accepted: boolean;
};

function finitePositive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : null;
}

export function assessClipIntegrityV103(
  expectedDurationSeconds: number,
  actualDurationSeconds: number,
): ClipIntegrityAssessmentV103 {
  const expected = Math.max(0, Number(expectedDurationSeconds) || 0);
  const actual = Math.max(0, Number(actualDurationSeconds) || 0);

  const toleranceSeconds = Math.max(
    1.5,
    Math.min(4, expected * 0.06),
  );
  const coverageRatio =
    expected > 0 ? Math.min(1, actual / expected) : 0;

  return {
    expectedDurationSeconds: expected,
    actualDurationSeconds: actual,
    coverageRatio: Number(coverageRatio.toFixed(6)),
    toleranceSeconds: Number(toleranceSeconds.toFixed(3)),
    accepted:
      expected > 0 &&
      actual > 0 &&
      actual + toleranceSeconds >= expected &&
      coverageRatio >= 0.94,
  };
}

async function probeDurationSeconds(filePath: string) {
  const ffprobe = await resolveFfprobe();

  return new Promise<number>((resolve, reject) => {
    const child = spawn(
      ffprobe,
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new Error(
          "clip_integrity_probe_timeout",
        ),
      );
    }, 15_000);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            `clip_integrity_probe_failed:${stderr.trim().slice(0, 300)}`,
          ),
        );
        return;
      }

      const duration = finitePositive(stdout.trim());
      if (duration === null) {
        reject(
          new Error(
            "clip_integrity_duration_unavailable",
          ),
        );
        return;
      }

      resolve(duration);
    });
  });
}

async function expectedPreservedDuration(
  builtPath: string,
) {
  try {
    const raw = JSON.parse(
      await readFile(`${builtPath}.json`, "utf8"),
    ) as Record<string, unknown>;

    const start = Date.parse(
      String(raw.clipStartsAt ?? ""),
    );
    const end = Date.parse(
      String(raw.clipEndsAt ?? ""),
    );

    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      end > start
    ) {
      return (end - start) / 1000;
    }

    return finitePositive(raw.durationSeconds);
  } catch {
    return null;
  }
}

function normalizeBuiltClip(
  built: any,
  actualDurationSeconds: number,
) {
  return {
    ...built,
    // A partir da 1.0.3 este campo significa duração REAL do MP4,
    // não a duração que havia sido solicitada.
    durationSeconds: actualDurationSeconds,
    outputBitrateKbps:
      Number(built?.byteSize) > 0 &&
      actualDurationSeconds > 0
        ? (Number(built.byteSize) * 8) /
          actualDurationSeconds /
          1000
        : built?.outputBitrateKbps ?? null,
    integrityVersion: 1,
  };
}

let installed = false;

/**
 * Validação fail-closed para o vídeo da 1.0.3.
 *
 * O worker legado da 1.0.2 continua responsável pela fila, mas os métodos
 * usados por ele passam a devolver a duração realmente medida por ffprobe.
 * Um MP4 de 4 s solicitado como 50 s deixa de ser enviado como "ready".
 */
export function installV103ClipIntegrity() {
  if (installed) return;
  installed = true;

  const proto = CircularClipBuffer.prototype as any;
  const originalPreservedClip = proto.preservedClip;
  const originalBuildClip = proto.buildClip;
  const originalRemovePreservedClip =
    proto.removePreservedClip;

  if (
    typeof originalPreservedClip !== "function" ||
    typeof originalBuildClip !== "function" ||
    typeof originalRemovePreservedClip !== "function"
  ) {
    throw new Error(
      "monitoria_v103_clip_buffer_contract_mismatch",
    );
  }

  proto.preservedClip = async function (
    this: CircularClipBuffer,
    agentEventId: string,
  ) {
    const built = await originalPreservedClip.call(
      this,
      agentEventId,
    );
    if (!built?.path) return built;

    const expected =
      await expectedPreservedDuration(built.path);

    if (expected === null) {
      throw new Error(
        "clip_integrity_preserved_metadata_missing",
      );
    }

    const actual =
      await probeDurationSeconds(built.path);
    const assessment = assessClipIntegrityV103(
      expected,
      actual,
    );

    if (!assessment.accepted) {
      // O MP4 preservado está definitivamente incompleto. Removê-lo permite
      // que o mesmo ciclo tente reconstruir a prova usando a timeline ainda
      // disponível, em vez de repetir para sempre o mesmo arquivo curto.
      await originalRemovePreservedClip.call(
        this,
        agentEventId,
      );
      return null;
    }

    return normalizeBuiltClip(built, actual);
  };

  proto.buildClip = async function (
    this: CircularClipBuffer,
    request: {
      durationSeconds: number;
      [key: string]: unknown;
    },
  ) {
    const built = await originalBuildClip.call(
      this,
      request,
    );

    if (!built?.path) {
      throw new Error(
        "clip_integrity_built_path_missing",
      );
    }

    const actual =
      await probeDurationSeconds(built.path);
    const assessment = assessClipIntegrityV103(
      Number(request.durationSeconds),
      actual,
    );

    if (!assessment.accepted) {
      // Não faz upload de evidência enganosa. O runtime 1.0.2 que hospeda a
      // fila tratará esta exceção como falha transitória e reagendará o clipe.
      await rm(path.dirname(built.path), {
        recursive: true,
        force: true,
      }).catch(() => undefined);

      throw new Error(
        `clip_incomplete_coverage: esperado=${assessment.expectedDurationSeconds.toFixed(
          2,
        )}s real=${assessment.actualDurationSeconds.toFixed(
          2,
        )}s cobertura=${(
          assessment.coverageRatio * 100
        ).toFixed(1)}%`,
      );
    }

    return normalizeBuiltClip(built, actual);
  };
}
