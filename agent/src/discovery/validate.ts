import { spawn } from "node:child_process";
import { sanitizeFfmpegError } from "../ffmpeg.js";
import { frameFingerprint } from "./frame-fingerprint.js";
import { describeStatusMessage, describeStream, RtspError } from "./rtsp.js";
import type { Credentials, StreamValidationResult } from "./types.js";

/**
 * Validação de stream conforme o item 3 da diretriz.
 *
 * A regra que governa tudo: nenhum caminho é aceito porque a porta respondeu.
 * A câmera só é dada como pronta depois que um quadro real foi decodificado
 * e mostrado ao usuário.
 *
 * Três etapas, na ordem, cada uma barata o suficiente para descartar
 * candidato ruim antes da próxima:
 *
 *   1. DESCRIBE  — separa erro de senha de erro de caminho, em milissegundos
 *   2. ffprobe   — codec, resolução, FPS, bitrate
 *   3. quadro    — decodificação real, checagem de imagem preta e fingerprint
 */

const PROBE_TIMEOUT_MS = 15_000;
const FRAME_TIMEOUT_MS = 20_000;

/** Amostra reduzida para a checagem de luminância/fingerprint. */
const SAMPLE_WIDTH = 160;
const SAMPLE_HEIGHT = 90;

/**
 * Abaixo disso, num intervalo de 0 a 255, a cena é escura demais para
 * qualquer análise. Cobre tampa fechada, infravermelho desligado e canal de
 * DVR sem câmera conectada — que devolve stream válido e preto.
 */
const BLACK_LUMA_THRESHOLD = 8;

type ExecResult = { code: number | null; stdout: Buffer; stderr: string };

function run(command: string, args: string[], timeoutMs: number): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const chunks: Buffer[] = [];
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Tempo esgotado ao ler o vídeo da câmera."));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      // Teto para um erro repetitivo do FFmpeg não consumir memória.
      if (stderr.length < 32_000) stderr += chunk;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks), stderr });
    });
  });
}

function parseFrameRate(value: unknown) {
  if (typeof value !== "string") return null;

  const [numerator, denominator] = value.split("/").map(Number);
  if (!numerator || !denominator) return null;

  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 100) / 100 : null;
}

function normalizeCodec(value: unknown): NonNullable<StreamValidationResult["codec"]> {
  const name = typeof value === "string" ? value.toLowerCase() : "";

  if (name === "h264" || name === "avc") return "h264";
  if (name === "hevc" || name === "h265") return "h265";
  if (name === "mjpeg") return "mjpeg";
  return "unknown";
}

type ProbeStream = {
  codec_name?: unknown;
  codec_type?: unknown;
  width?: unknown;
  height?: unknown;
  r_frame_rate?: unknown;
  avg_frame_rate?: unknown;
  bit_rate?: unknown;
};

async function probeStream(ffprobePath: string, rtspUrl: string) {
  const result = await run(
    ffprobePath,
    [
      "-v",
      "error",
      "-rtsp_transport",
      "tcp",
      "-rw_timeout",
      "10000000",
      "-print_format",
      "json",
      "-show_streams",
      "-select_streams",
      "v:0",
      "-i",
      rtspUrl,
    ],
    PROBE_TIMEOUT_MS,
  );

  if (result.code !== 0) {
    throw new Error(sanitizeFfmpegError(result.stderr || "O ffprobe não leu o stream."));
  }

  const parsed = JSON.parse(result.stdout.toString("utf8")) as { streams?: ProbeStream[] };
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");

  if (!video) throw new Error("O stream não possui faixa de vídeo.");

  return video;
}

export function frameDecodeArguments(rtspUrl: string) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-frames:v",
    "1",
    "-vf",
    `scale=${SAMPLE_WIDTH}:${SAMPLE_HEIGHT}`,
    "-pix_fmt",
    "gray",
    "-f",
    "rawvideo",
    "-",
  ];
}

async function decodeSampleFrame(ffmpegPath: string, rtspUrl: string) {
  const result = await run(
    ffmpegPath,
    frameDecodeArguments(rtspUrl),
    FRAME_TIMEOUT_MS,
  );

  const expected = SAMPLE_WIDTH * SAMPLE_HEIGHT;

  if (result.code !== 0 || result.stdout.length < expected) {
    throw new Error(
      sanitizeFfmpegError(result.stderr || "Não foi possível decodificar um quadro."),
    );
  }

  const frame = result.stdout.subarray(0, expected);

  let total = 0;
  for (let index = 0; index < expected; index += 1) {
    total += frame[index] ?? 0;
  }

  return {
    meanLuma: total / expected,
    fingerprint: frameFingerprint(
      frame,
      SAMPLE_WIDTH,
      SAMPLE_HEIGHT,
    ),
  };
}

export async function validateStream(options: {
  ffmpegPath: string;
  ffprobePath: string;
  rtspUrl: string;
  credentials: Credentials;
  log?: (message: string) => void;
}): Promise<StreamValidationResult> {
  const startedAt = Date.now();
  const log = options.log ?? (() => undefined);

  const result: StreamValidationResult = {
    success: false,
    firstFrameDecoded: false,
    blackFrameDetected: false,
  };

  let video;

  try {
    video = await probeStream(options.ffprobePath, options.rtspUrl);
  } catch (probeError) {
    const detalhe = probeError instanceof Error ? probeError.message : "falha desconhecida";
    log(`ffprobe recusou o stream: ${detalhe}`);

    try {
      const describe = await describeStream(options.rtspUrl, options.credentials);
      result.rtspStatus = describe.status;
      result.latencyMs = describe.latencyMs;
      result.errorCode = `rtsp_${describe.status}`;
      result.errorMessage = describeStatusMessage(describe.status);
      log(`DESCRIBE respondeu ${describe.status}.`);
    } catch (describeError) {
      result.errorCode =
        describeError instanceof RtspError ? describeError.code : "probe_failed";
      result.errorMessage = detalhe;
    }

    return result;
  }

  result.codec = normalizeCodec(video.codec_name);

  if (typeof video.width === "number") result.width = video.width;
  if (typeof video.height === "number") result.height = video.height;

  const fps = parseFrameRate(video.r_frame_rate) ?? parseFrameRate(video.avg_frame_rate);
  if (fps !== null) result.fps = fps;

  const bitrate = Number(video.bit_rate);
  if (Number.isFinite(bitrate) && bitrate > 0) {
    result.bitrateKbps = Math.round(bitrate / 1000);
  }

  if (!result.width || !result.height) {
    result.errorCode = "invalid_resolution";
    result.errorMessage = "O stream não informou uma resolução válida.";
    return result;
  }

  try {
    const sample = await decodeSampleFrame(options.ffmpegPath, options.rtspUrl);
    result.firstFrameDecoded = true;
    result.blackFrameDetected = sample.meanLuma < BLACK_LUMA_THRESHOLD;
    result.frameFingerprint = sample.fingerprint;
  } catch (error) {
    result.errorCode = "frame_decode_failed";
    result.errorMessage =
      error instanceof Error ? error.message : "Não foi possível decodificar um quadro.";
    log(`Decodificação de quadro falhou: ${result.errorMessage}`);
    return result;
  }

  if (result.blackFrameDetected) {
    result.errorCode = "black_frame";
    result.errorMessage =
      "O vídeo abriu, mas a imagem está totalmente escura. " +
      "Verifique a iluminação, a tampa da lente ou se há câmera ligada neste canal.";
    return result;
  }

  result.success = true;
  result.latencyMs = Date.now() - startedAt;

  log(
    `Stream validado: ${result.codec} ${result.width}x${result.height}` +
      `${result.fps ? ` @ ${result.fps}fps` : ""}.`,
  );

  return result;
}
