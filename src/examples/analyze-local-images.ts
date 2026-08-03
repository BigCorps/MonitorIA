import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createVisionProvider } from "../vision/create-provider.js";
import type { EventFrame } from "../vision/types.js";

const imagePaths = process.argv.slice(2);

if (imagePaths.length < 1 || imagePaths.length > 4) {
  console.error(
    "Uso: npm run analyze -- frame-inicial.jpg [frame-pico.jpg] [frame-final.jpg]",
  );
  process.exit(1);
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      throw new Error(`Formato não suportado: ${path}`);
  }
}

const labels: EventFrame["label"][] = [
  "start",
  "peak",
  "end",
  "extra",
];
const now = new Date();
const frames: EventFrame[] = [];

for (const [index, path] of imagePaths.entries()) {
  const absolutePath = resolve(path);
  const bytes = await readFile(absolutePath);

  frames.push({
    label: labels[index] ?? "extra",
    capturedAt: new Date(
      now.getTime() + index * 10_000,
    ).toISOString(),
    imageUrl: `data:${mimeType(path)};base64,${bytes.toString(
      "base64",
    )}`,
  });
}

const cameraId = randomUUID();
const entranceZoneId = randomUUID();
const provider = createVisionProvider();

const result = await provider.analyzeEvent({
  organizationId: randomUUID(),
  eventId: randomUUID(),
  startedAt: frames[0]!.capturedAt,
  endedAt: frames.at(-1)!.capturedAt,
  profile: {
    cameraId,
    profileVersion: 1,
    environmentDescription:
      "Ambiente comercial visto por uma câmera estática.",
    monitoringGoals: [
      "identificar entrada e saída de pessoas e veículos",
      "descrever alterações relevantes no ambiente",
    ],
    ignoreInstructions: [
      "ignorar variações pequenas de iluminação",
    ],
    timezone: "America/Sao_Paulo",
    zones: [
      {
        id: entranceZoneId,
        name: "Entrada principal",
        type: "entry",
        personRoleHint: "customer",
        polygon: [
          { x: 0.0, y: 0.0 },
          { x: 1.0, y: 0.0 },
          { x: 1.0, y: 1.0 },
          { x: 0.0, y: 1.0 },
        ],
        description:
          "Zona de teste cobrindo todo o quadro.",
      },
    ],
    visualEntities: [],
    staffProfiles: [],
  },
  frames,
  localMetrics: {
    peakMotionPercent: 5,
    meanMotionPercent: 2,
    durationSeconds: Math.max(
      10,
      (frames.length - 1) * 10,
    ),
  },
});

console.log(JSON.stringify(result, null, 2));
