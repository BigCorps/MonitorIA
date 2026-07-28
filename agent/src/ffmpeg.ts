import { spawn } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { CapturedFrame } from "./types.js";

async function runExecutable(
  executable: string,
  args: string[],
  timeoutMs = 10_000,
) {
  return new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      const child = spawn(executable, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        if (timedOut) {
          reject(new Error("O FFmpeg excedeu o tempo limite."));
          return;
        }

        resolve({
          stdout,
          stderr,
          code: code ?? -1,
        });
      });
    },
  );
}

async function findInWingetDirectory() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const base = path.join(
    localAppData,
    "Microsoft",
    "WinGet",
    "Packages",
  );

  try {
    const entries = await readdir(base, {
      recursive: true,
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isFile() || entry.name.toLowerCase() !== "ffmpeg.exe") {
        continue;
      }

      const parentPath =
        "parentPath" in entry && typeof entry.parentPath === "string"
          ? entry.parentPath
          : base;
      return path.join(parentPath, entry.name);
    }
  } catch {
    return null;
  }

  return null;
}

export async function resolveFfmpeg() {
  const configured = process.env.MONITORIA_FFMPEG_PATH?.trim();
  const candidates = [
    configured,
    "ffmpeg",
    await findInWingetDirectory(),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      const result = await runExecutable(candidate, ["-version"], 8_000);
      if (result.code === 0 && result.stdout.toLowerCase().includes("ffmpeg version")) {
        return candidate;
      }
    } catch {
      // Tenta o próximo caminho.
    }
  }

  throw new Error(
    "FFmpeg não encontrado. Instale com: winget install --id Gyan.FFmpeg -e",
  );
}

function sanitizeFfmpegError(value: string) {
  return value
    .replace(/rtsp:\/\/[^\s'"]+/gi, "[URL RTSP ocultada]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function jpegDimensions(buffer: Buffer) {
  let offset = 2;

  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) break;

    const isStartOfFrame =
      marker !== undefined &&
      [
        0xc0, 0xc1, 0xc2, 0xc3,
        0xc5, 0xc6, 0xc7,
        0xc9, 0xca, 0xcb,
        0xcd, 0xce, 0xcf,
      ].includes(marker);

    if (isStartOfFrame && offset + 8 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return { width: null, height: null };
}

export async function captureFrame(
  ffmpegPath: string,
  rtspUrl: string,
  cameraId: string,
): Promise<CapturedFrame> {
  const directory = path.join(os.tmpdir(), "MonitorIA", "frames");
  await import("node:fs/promises").then(({ mkdir }) =>
    mkdir(directory, { recursive: true }),
  );

  const output = path.join(
    directory,
    `${cameraId}-${Date.now()}.jpg`,
  );

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-map",
    "0:v:0",
    "-frames:v",
    "1",
    "-an",
    "-vf",
    "scale=1280:-2:force_original_aspect_ratio=decrease",
    "-q:v",
    "3",
    "-y",
    output,
  ];

  const result = await runExecutable(ffmpegPath, args, 30_000);
  if (result.code !== 0) {
    throw new Error(
      sanitizeFfmpegError(result.stderr) ||
        `FFmpeg encerrou com o código ${result.code}.`,
    );
  }

  const fileStat = await stat(output);
  if (fileStat.size < 1024) {
    throw new Error("O FFmpeg gerou uma imagem vazia ou inválida.");
  }

  const bytes = await readFile(output);
  if (
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    throw new Error("O arquivo capturado não é um JPEG válido.");
  }

  const dimensions = jpegDimensions(bytes);

  return {
    path: output,
    width: dimensions.width,
    height: dimensions.height,
    byteSize: fileStat.size,
    capturedAt: new Date().toISOString(),
  };
}
