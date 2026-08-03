import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

const WIDTH = 160;
const HEIGHT = 90;
const GRID_COLUMNS = 16;
const GRID_ROWS = 9;
const FRAME_BYTES = WIDTH * HEIGHT;

export type CameraHealthSample = {
  capturedAt: string;
  source: "periodic" | "startup";
  width: number;
  height: number;
  brightnessMean: number;
  contrastStddev: number;
  edgeDensity: number;
  blurScore: number;
  darkPixelRatio: number;
  brightPixelRatio: number;
  gridSignature: number[];
  contentHash: string;
  metadata: Record<string, unknown>;
};

const rounded = (value: number, digits = 4) => Number(value.toFixed(digits));

export function calculateCameraHealthMetrics(frame: Uint8Array): Omit<CameraHealthSample, "capturedAt" | "source" | "metadata"> {
  if (frame.length !== FRAME_BYTES) throw new Error(`Quadro de saúde inválido: ${frame.length} bytes.`);
  let sum = 0, dark = 0, bright = 0;
  for (const value of frame) { sum += value; if (value <= 24) dark += 1; if (value >= 232) bright += 1; }
  const mean = sum / frame.length;
  let variance = 0, edgeCount = 0, laplacianSum = 0, laplacianSquared = 0, laplacianCount = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = y * WIDTH + x; const value = Number(frame[index]); variance += (value - mean) ** 2;
      if (x > 0 && Math.abs(value - Number(frame[index - 1])) >= 18) edgeCount += 1;
      if (y > 0 && Math.abs(value - Number(frame[index - WIDTH])) >= 18) edgeCount += 1;
      if (x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1) {
        const laplacian = Number(frame[index - 1]) + Number(frame[index + 1]) + Number(frame[index - WIDTH]) + Number(frame[index + WIDTH]) - 4 * value;
        laplacianSum += laplacian; laplacianSquared += laplacian * laplacian; laplacianCount += 1;
      }
    }
  }
  const lapMean = laplacianCount ? laplacianSum / laplacianCount : 0;
  const blurScore = laplacianCount ? laplacianSquared / laplacianCount - lapMean * lapMean : 0;
  const gridSignature: number[] = [];
  const cellWidth = WIDTH / GRID_COLUMNS, cellHeight = HEIGHT / GRID_ROWS;
  for (let row = 0; row < GRID_ROWS; row += 1) for (let column = 0; column < GRID_COLUMNS; column += 1) {
    let cellSum = 0, cellCount = 0;
    const startX = Math.floor(column * cellWidth), endX = Math.floor((column + 1) * cellWidth);
    const startY = Math.floor(row * cellHeight), endY = Math.floor((row + 1) * cellHeight);
    for (let y = startY; y < endY; y += 1) for (let x = startX; x < endX; x += 1) { cellSum += Number(frame[y * WIDTH + x]); cellCount += 1; }
    gridSignature.push(Math.round(cellCount ? cellSum / cellCount : 0));
  }
  return {
    width: WIDTH, height: HEIGHT, brightnessMean: rounded(mean),
    contrastStddev: rounded(Math.sqrt(variance / frame.length)),
    edgeDensity: rounded(edgeCount / Math.max(1, ((WIDTH - 1) * HEIGHT + (HEIGHT - 1) * WIDTH)), 6),
    blurScore: rounded(Math.max(0, blurScore)), darkPixelRatio: rounded(dark / frame.length, 6),
    brightPixelRatio: rounded(bright / frame.length, 6), gridSignature,
    contentHash: createHash("sha256").update(frame).digest("hex"),
  };
}

export async function captureCameraHealthSample(options: { ffmpegPath: string; rtspUrl: string; source?: "periodic" | "startup"; timeoutMs?: number; }): Promise<CameraHealthSample> {
  const args = ["-hide_banner","-loglevel","error","-rtsp_transport","tcp","-i",options.rtspUrl,"-map","0:v:0","-an","-frames:v","1","-vf",`scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=gray`,"-pix_fmt","gray","-f","rawvideo","pipe:1"];
  return new Promise((resolve, reject) => {
    const child = spawn(options.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = []; let stderr = ""; let settled = false;
    const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new Error("Tempo limite ao capturar amostra de saúde.")); }, options.timeoutMs ?? 20_000);
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.setEncoding("utf8"); child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-2000); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return; const buffer = Buffer.concat(chunks);
      if (code !== 0 || buffer.length < FRAME_BYTES) return finish(new Error(stderr.trim() || `FFmpeg encerrou com código ${code ?? -1}.`));
      const metrics = calculateCameraHealthMetrics(buffer.subarray(0, FRAME_BYTES)); settled = true; clearTimeout(timer);
      resolve({ ...metrics, capturedAt: new Date().toISOString(), source: options.source ?? "periodic", metadata: { sampler: "ffmpeg_raw_gray_v1" } });
    });
  });
}
