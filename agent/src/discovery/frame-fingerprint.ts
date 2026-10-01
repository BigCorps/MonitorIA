import { createHash } from "node:crypto";

export type FrameFingerprint = {
  contentHash: string;
  perceptualHash: string;
  grid: number[];
  meanLuma: number;
  contrast: number;
};

const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const HASH_COLUMNS = 9;
const HASH_ROWS = 8;

function regionAverage(
  frame: Uint8Array,
  width: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
) {
  let total = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    const row = y * width;
    for (let x = xStart; x < xEnd; x += 1) {
      total += frame[row + x] ?? 0;
      count += 1;
    }
  }

  return count > 0 ? Math.round(total / count) : 0;
}

function sampleGrid(
  frame: Uint8Array,
  width: number,
  height: number,
  columns: number,
  rows: number,
) {
  const values: number[] = [];

  for (let row = 0; row < rows; row += 1) {
    const yStart = Math.floor((row * height) / rows);
    const yEnd = Math.max(
      yStart + 1,
      Math.floor(((row + 1) * height) / rows),
    );

    for (let column = 0; column < columns; column += 1) {
      const xStart = Math.floor((column * width) / columns);
      const xEnd = Math.max(
        xStart + 1,
        Math.floor(((column + 1) * width) / columns),
      );

      values.push(
        regionAverage(
          frame,
          width,
          xStart,
          xEnd,
          yStart,
          yEnd,
        ),
      );
    }
  }

  return values;
}

function perceptualHash(
  frame: Uint8Array,
  width: number,
  height: number,
) {
  const grid = sampleGrid(
    frame,
    width,
    height,
    HASH_COLUMNS,
    HASH_ROWS,
  );

  let value = 0n;

  for (let row = 0; row < HASH_ROWS; row += 1) {
    for (let column = 0; column < HASH_COLUMNS - 1; column += 1) {
      const left = grid[row * HASH_COLUMNS + column] ?? 0;
      const right = grid[row * HASH_COLUMNS + column + 1] ?? 0;
      value = (value << 1n) | (left > right ? 1n : 0n);
    }
  }

  return value.toString(16).padStart(16, "0");
}

function gridContrast(values: number[]) {
  if (!values.length) return 0;

  const mean =
    values.reduce((total, value) => total + value, 0) /
    values.length;

  const variance =
    values.reduce(
      (total, value) => total + (value - mean) ** 2,
      0,
    ) / values.length;

  return Math.sqrt(variance);
}

export function frameFingerprint(
  frame: Uint8Array,
  width: number,
  height: number,
): FrameFingerprint {
  if (frame.length < width * height) {
    throw new Error("Quadro insuficiente para gerar fingerprint.");
  }

  const grid = sampleGrid(
    frame,
    width,
    height,
    GRID_COLUMNS,
    GRID_ROWS,
  );

  const meanLuma =
    frame
      .subarray(0, width * height)
      .reduce((total, value) => total + value, 0) /
    (width * height);

  return {
    contentHash: createHash("sha256")
      .update(frame.subarray(0, width * height))
      .digest("hex"),
    perceptualHash: perceptualHash(frame, width, height),
    grid,
    meanLuma,
    contrast: gridContrast(grid),
  };
}

export function hammingDistanceHex(
  first: string,
  second: string,
) {
  let value: bigint;

  try {
    value = BigInt(`0x${first}`) ^ BigInt(`0x${second}`);
  } catch {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }

  return distance;
}

export function gridMeanAbsoluteDifference(
  first: number[],
  second: number[],
) {
  if (
    first.length === 0 ||
    first.length !== second.length
  ) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;

  for (let index = 0; index < first.length; index += 1) {
    total += Math.abs(
      (first[index] ?? 0) - (second[index] ?? 0),
    );
  }

  return total / first.length;
}

/**
 * Comparação conservadora para a descoberta de canais de DVR/NVR.
 *
 * Ela só é usada quando o firmware não fornece sourceToken ONVIF confiável.
 * O objetivo é impedir que um gravador que devolve a MESMA imagem para
 * channel=1,2,3... crie várias câmeras fictícias.
 *
 * Cenas de contraste muito baixo são deliberadamente inconclusivas, salvo
 * quando o frame bruto é idêntico. Isso prefere um falso negativo a juntar
 * duas câmeras físicas diferentes.
 */
export function isLikelySameVisualStream(
  first: FrameFingerprint | undefined,
  second: FrameFingerprint | undefined,
) {
  if (!first || !second) return false;

  if (first.contentHash === second.contentHash) {
    return true;
  }

  if (
    Math.min(first.contrast, second.contrast) < 6
  ) {
    return false;
  }

  const hamming = hammingDistanceHex(
    first.perceptualHash,
    second.perceptualHash,
  );
  const gridDifference = gridMeanAbsoluteDifference(
    first.grid,
    second.grid,
  );
  const brightnessDifference = Math.abs(
    first.meanLuma - second.meanLuma,
  );

  return (
    hamming <= 8 &&
    gridDifference <= 8 &&
    brightnessDifference <= 10
  );
}
