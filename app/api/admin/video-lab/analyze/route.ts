import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { CameraProfileSchema } from "@/src/contracts/camera-profile";
import { DefaultCameraIntelligenceConfig } from "@/src/contracts/scene-intelligence";
import { requireInternalOperator } from "@/src/lib/internal-operator";
import { createVisionProvider } from "@/src/vision/create-provider";
import type { EventFrame } from "@/src/vision/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type FrameLabel = EventFrame["label"];

type RequestFrame = {
  label?: unknown;
  capturedAt?: unknown;
  imageUrl?: unknown;
};

type RequestBody = {
  startedAt?: unknown;
  endedAt?: unknown;
  environmentDescription?: unknown;
  monitoringGoal?: unknown;
  peakMotionPercent?: unknown;
  meanMotionPercent?: unknown;
  framesObserved?: unknown;
  frames?: unknown;
};

const ALLOWED_LABELS = new Set<FrameLabel>([
  "start",
  "peak",
  "end",
  "extra",
]);

function text(value: unknown, fallback: string, maximum: number) {
  const normalized = String(value ?? "").trim();
  return (normalized || fallback).slice(0, maximum);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function validIso(value: unknown) {
  const normalized = String(value ?? "").trim();
  const milliseconds = Date.parse(normalized);
  if (!normalized || !Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toISOString();
}

function validFrame(value: RequestFrame): EventFrame | null {
  const label = String(value.label ?? "") as FrameLabel;
  const capturedAt = validIso(value.capturedAt);
  const imageUrl = String(value.imageUrl ?? "");

  if (!ALLOWED_LABELS.has(label) || !capturedAt) return null;

  // Um quadro JPEG 640px com qualidade moderada fica muito abaixo deste teto.
  // O limite evita transformar esta rota em um upload genérico de arquivos.
  if (
    !imageUrl.startsWith("data:image/jpeg;base64,") ||
    imageUrl.length > 900_000
  ) {
    return null;
  }

  return { label, capturedAt, imageUrl };
}

export async function POST(request: Request) {
  await requireInternalOperator();

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { error: "Payload inválido." },
      { status: 400 },
    );
  }

  const startedAt = validIso(body.startedAt);
  const endedAt = validIso(body.endedAt);
  if (!startedAt || !endedAt || Date.parse(endedAt) <= Date.parse(startedAt)) {
    return NextResponse.json(
      { error: "Intervalo do acontecimento inválido." },
      { status: 400 },
    );
  }

  const durationSeconds =
    (Date.parse(endedAt) - Date.parse(startedAt)) / 1000;
  if (durationSeconds > 600) {
    return NextResponse.json(
      { error: "O acontecimento de teste excedeu 10 minutos." },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.frames)) {
    return NextResponse.json(
      { error: "Quadros ausentes." },
      { status: 400 },
    );
  }

  const frames = body.frames
    .slice(0, 4)
    .map((frame) => validFrame((frame ?? {}) as RequestFrame))
    .filter((frame): frame is EventFrame => Boolean(frame));

  if (frames.length < 1 || frames.length > 4) {
    return NextResponse.json(
      { error: "Envie de 1 a 4 quadros JPEG válidos." },
      { status: 400 },
    );
  }

  const cameraId = randomUUID();
  const zoneId = randomUUID();
  const organizationId = randomUUID();
  const eventId = randomUUID();

  const profile = CameraProfileSchema.parse({
    cameraId,
    profileVersion: 1,
    environmentDescription: text(
      body.environmentDescription,
      "Gravação de teste enviada pelo laboratório interno do MonitorIA.",
      1200,
    ),
    monitoringGoals: [
      text(
        body.monitoringGoal,
        "Descrever mudanças e acontecimentos visualmente relevantes.",
        280,
      ),
    ],
    ignoreInstructions: [
      "Não invente acontecimentos que não estejam visíveis nos quadros.",
      "Considere que os quadros vieram de uma gravação já existente e podem estar separados por alguns segundos.",
    ],
    intelligence: DefaultCameraIntelligenceConfig,
    timezone: "America/Sao_Paulo",
    zones: [
      {
        id: zoneId,
        name: "Quadro completo",
        type: "general",
        personRoleHint: "none",
        polygon: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ],
        description: "Área integral da gravação usada somente neste teste.",
      },
    ],
    visualEntities: [],
    staffProfiles: [],
  });

  try {
    const provider = createVisionProvider({ detail: "low" });
    const result = await provider.analyzeEvent({
      organizationId,
      eventId,
      startedAt,
      endedAt,
      profile,
      frames,
      analysisMode: "balanced",
      localMetrics: {
        peakMotionPercent: boundedNumber(
          body.peakMotionPercent,
          0,
          0,
          100,
        ),
        meanMotionPercent: boundedNumber(
          body.meanMotionPercent,
          0,
          0,
          100,
        ),
        durationSeconds,
        framesObserved: Math.round(
          boundedNumber(body.framesObserved, frames.length, 1, 100_000),
        ),
        closeReason: "uploaded_video_lab",
      },
    });

    return NextResponse.json({
      event: result.event,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      latencyMs: result.latencyMs,
    });
  } catch (error) {
    console.error("[admin-video-lab] Falha na análise:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message.slice(0, 600)
            : "Falha desconhecida na análise.",
      },
      { status: 500 },
    );
  }
}
