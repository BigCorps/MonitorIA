import { spawn } from "node:child_process";
import { sanitizeFfmpegError } from "../ffmpeg.js";
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
 *   3. quadro    — decodificação real e checagem de imagem preta
 */

const PROBE_TIMEOUT_MS = 15_000;
const FRAME_TIMEOUT_MS = 20_000;

/** Amostra reduzida para a checagem de luminância. Mesmo formato do motion. */
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
      // TCP em vez de UDP: rede de loja com Wi-Fi perde pacote, e um
      // diagnóstico que falha por perda de UDP acusaria a câmera errada.
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

/**
 * Decodifica um quadro em escala de cinza reduzida e mede a luminância média.
 *
 * Fazemos assim em vez de usar o filtro blackdetect por dois motivos: o
 * pipeline de rawvideo já existe no motion.ts e é conhecido, e a média é lida
 * diretamente dos bytes em vez de depender de parsing de log do FFmpeg.
 */
async function decodeSampleFrame(ffmpegPath: string, rtspUrl: string) {
  const result = await run(
    ffmpegPath,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-rtsp_transport",
      "tcp",
      "-rw_timeout",
      "10000000",
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
    ],
    FRAME_TIMEOUT_MS,
  );

  const expected = SAMPLE_WIDTH * SAMPLE_HEIGHT;

  if (result.code !== 0 || result.stdout.length < expected) {
    throw new Error(
      sanitizeFfmpegError(result.stderr || "Não foi possível decodificar um quadro."),
    );
  }

  let total = 0;
  for (let index = 0; index < expected; index += 1) total += result.stdout[index] ?? 0;

  return { meanLuma: total / expected };
}

export async function validateStream(options: {
  ffmpegPath: string;
  ffprobePath: string;
  rtspUrl: string;
  credentials: Credentials;
}): Promise<StreamValidationResult> {
  const startedAt = Date.now();

  const result: StreamValidationResult = {
    success: false,
    firstFrameDecoded: false,
    blackFrameDetected: false,
  };

  // Etapa 1: DESCRIBE. Barata e decisiva — separa senha errada de caminho
  // errado antes de gastar segundos abrindo o stream.
  try {
    const describe = await describeStream(options.rtspUrl, options.credentials);
    result.rtspStatus = describe.status;
    result.latencyMs = describe.latencyMs;

    if (describe.status !== 200) {
      result.errorCode = `rtsp_${describe.status}`;
      result.errorMessage = describeStatusMessage(describe.status);
      return result;
    }

    if (describe.codec !== null) result.codec = describe.codec;
    if (describe.width !== null) result.width = describe.width;
    if (describe.height !== null) result.height = describe.height;
  } catch (error) {
    result.errorCode = error instanceof RtspError ? error.code : "rtsp_unreachable";
    result.errorMessage =
      error instanceof Error ? error.message : "Falha ao conversar com a câmera.";
    return result;
  }

  // Etapa 2: metadados reais do stream.
  try {
    const video = await probeStream(options.ffprobePath, options.rtspUrl);

    result.codec = normalizeCodec(video.codec_name);

    if (typeof video.width === "number") result.width = video.width;
    if (typeof video.height === "number") result.height = video.height;

    const fps = parseFrameRate(video.r_frame_rate) ?? parseFrameRate(video.avg_frame_rate);
    if (fps !== null) result.fps = fps;

    const bitrate = Number(video.bit_rate);
    if (Number.isFinite(bitrate) && bitrate > 0) {
      result.bitrateKbps = Math.round(bitrate / 1000);
    }
  } catch (error) {
    result.errorCode = "probe_failed";
    result.errorMessage =
      error instanceof Error ? error.message : "Não foi possível ler os dados do vídeo.";
    return result;
  }

  if (!result.width || !result.height) {
    result.errorCode = "invalid_resolution";
    result.errorMessage = "O stream não informou uma resolução válida.";
    return result;
  }

  // Etapa 3: quadro real. É o que separa "a porta respondeu" de "há imagem".
  try {
    const sample = await decodeSampleFrame(options.ffmpegPath, options.rtspUrl);
    result.firstFrameDecoded = true;
    result.blackFrameDetected = sample.meanLuma < BLACK_LUMA_THRESHOLD;
  } catch (error) {
    result.errorCode = "frame_decode_failed";
    result.errorMessage =
      error instanceof Error ? error.message : "Não foi possível decodificar um quadro.";
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
  return result;
}
