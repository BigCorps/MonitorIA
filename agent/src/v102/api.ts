import { prepareEventFramesForUpload } from "../evidence-budget.js";
import { ApiError } from "../api.js";
import type { EventSubmissionResponse, LocalMotionEvent } from "../types.js";

const MAX_REDIRECTS = 3;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function registrableDomain(host: string) {
  return host.toLowerCase().split(".").slice(-2).join(".");
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { return null; }
}

/**
 * Transporte oficial do Agent 1.0.2 para acontecimentos.
 *
 * É propositalmente separado da função 1.0.1: o endpoint v2 responde após a
 * persistência durável (202) e nunca espera a IA nem o vídeo. Mantém a mesma
 * política segura de redirecionamento do api.ts legado para não perder o
 * Authorization entre monitoria.cam e www.monitoria.cam.
 */
export async function submitCameraEventV102(
  baseUrl: string,
  token: string,
  event: LocalMotionEvent,
  ffmpegPath: string,
): Promise<EventSubmissionResponse> {
  const prepared = await prepareEventFramesForUpload(ffmpegPath, event);
  const body = JSON.stringify({
    eventId: event.eventId,
    sessionId: event.sessionId,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    localMetrics: {
      ...event.localMetrics,
      ...prepared.diagnostics,
    },
    frames: prepared.frames,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  let target = `${normalizeBaseUrl(baseUrl)}/api/agent/v2/cameras/${encodeURIComponent(event.cameraId)}/events`;
  let headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json; charset=utf-8",
  };

  try {
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(target, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
        redirect: "manual",
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const location = response.headers.get("location");
      if (!location) break;
      const next = new URL(location, target);
      const previous = new URL(target);
      const sameOwner =
        next.protocol === "https:" &&
        registrableDomain(next.hostname) === registrableDomain(previous.hostname);
      if (!sameOwner && headers.Authorization) {
        const { Authorization: _removed, ...rest } = headers;
        headers = rest;
      }
      target = next.toString();
    }

    if (!response) throw new ApiError("A API não respondeu.", 0, null);
    const data = await parseJson(response);
    if (!response.ok) {
      const code = data && typeof data.error === "string" ? data.error : null;
      throw new ApiError(
        `A API retornou HTTP ${response.status}${code ? ` (${code})` : ""}.`,
        response.status,
        code,
      );
    }
    return data as EventSubmissionResponse;
  } finally {
    clearTimeout(timer);
  }
}
