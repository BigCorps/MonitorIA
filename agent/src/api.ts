import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type {
  CapturedFrame,
  CaptureSessionResponse,
  ConfigResponse,
  EventSubmissionResponse,
  LocalMotionEvent,
  PairResponse,
} from "./types.js";
import { prepareEventFramesForUpload } from "./evidence-budget.js";

type JsonObject = Record<string, unknown>;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
  ) {
    super(message);
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Domínio registrável, ignorando subdomínio.
 *
 * Usado para decidir se o cabeçalho Authorization pode acompanhar um
 * redirecionamento: monitoria.cam e www.monitoria.cam são a mesma
 * propriedade, um domínio de terceiro não é.
 */
function registrableDomain(host: string) {
  return host.toLowerCase().split(".").slice(-2).join(".");
}

const MAX_REDIRECTS = 3;

async function parseJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as JsonObject;
  } catch {
    return null;
  }
}

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let target = `${normalizeBaseUrl(baseUrl)}${path}`;
    let headers: Record<string, string> = {
      Accept: "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    };

    let response: Response | null = null;

    /**
     * Redirecionamento seguido à mão.
     *
     * O `fetch` remove o cabeçalho Authorization ao seguir redirecionamento
     * entre origens diferentes — comportamento correto para um navegador e
     * desastroso aqui. Em produção, monitoria.cam responde 308 para
     * www.monitoria.cam: a requisição chegava sem token e o servidor
     * devolvia 401, que o Agent reportava como "token recusado". Horas de
     * diagnóstico por causa de uma barra de domínio.
     *
     * Só reenviamos a credencial quando o destino é HTTPS e pertence ao
     * mesmo domínio registrável.
     */
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(target, {
        ...init,
        signal: controller.signal,
        headers,
        redirect: "manual",
      });

      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const location = response.headers.get("location");
      if (!location) break;

      const next = new URL(location, target);
      const previous = new URL(target);

      const mesmaPropriedade =
        next.protocol === "https:" &&
        registrableDomain(next.hostname) === registrableDomain(previous.hostname);

      if (!mesmaPropriedade && headers.Authorization) {
        const { Authorization: _removido, ...semCredencial } = headers;
        headers = semCredencial;
      }

      // 303 e 302 sobre POST viram GET, conforme o protocolo.
      if (response.status === 303 && init.method && init.method !== "GET") {
        const { body: _semCorpo, ...semBody } = init;
        init = { ...semBody, method: "GET" };
      }

      target = next.toString();
    }

    if (!response) {
      throw new ApiError("A API não respondeu.", 0, null);
    }

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      const code =
        data && typeof data.error === "string"
          ? data.error
          : null;

      throw new ApiError(
        `A API retornou HTTP ${response.status}${
          code ? ` (${code})` : ""
        }.`,
        response.status,
        code,
      );
    }

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

export async function pairAgent(
  baseUrl: string,
  input: {
    code: string;
    agentName: string;
    platform: string;
    architecture: string;
    version: string;
    metadata?: JsonObject;
  },
) {
  return requestJson<PairResponse>(baseUrl, "/api/agent/pair", {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(input),
  });
}

export async function fetchAgentConfig(
  baseUrl: string,
  token: string,
) {
  return requestJson<ConfigResponse>(
    baseUrl,
    "/api/agent/config",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export async function sendHeartbeat(
  baseUrl: string,
  token: string,
  body: JsonObject,
) {
  return requestJson<{
    ok: true;
    agentId: string;
    serverTime: string;
  }>(baseUrl, "/api/agent/heartbeat", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
}

export async function sendCameraStatus(
  baseUrl: string,
  token: string,
  cameraId: string,
  body: JsonObject,
) {
  return requestJson<{
    ok: true;
    cameraId: string;
    status: string;
    serverTime: string;
  }>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(cameraId)}/status`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    },
  );
}

export async function uploadSnapshot(
  baseUrl: string,
  token: string,
  cameraId: string,
  frame: CapturedFrame,
  streamLabel?: string,
) {
  const bytes = await readFile(frame.path);

  return requestJson<{
    ok: true;
    cameraId: string;
    assetId: string;
    capturedAt: string;
    expiresAt: string;
    byteSize: number;
    width: number | null;
    height: number | null;
  }>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(cameraId)}/snapshot`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
        "X-MonitorIA-Captured-At": frame.capturedAt,
        ...(frame.width
          ? { "X-MonitorIA-Width": String(frame.width) }
          : {}),
        ...(frame.height
          ? { "X-MonitorIA-Height": String(frame.height) }
          : {}),
        ...(streamLabel
          ? { "X-MonitorIA-Stream-Label": streamLabel }
          : {}),
      },
      body: bytes,
    },
    30_000,
  );
}

export async function startCaptureSession(
  baseUrl: string,
  token: string,
  cameraId: string,
  metadata: JsonObject,
) {
  return requestJson<CaptureSessionResponse>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(cameraId)}/session`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        action: "start",
        startedAt: new Date().toISOString(),
        metadata,
      }),
    },
  );
}

export async function closeCaptureSession(
  baseUrl: string,
  token: string,
  cameraId: string,
  sessionId: string,
  endedReason: string,
) {
  return requestJson<CaptureSessionResponse>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(cameraId)}/session`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        action: "end",
        sessionId,
        endedReason,
      }),
    },
  );
}

export async function submitCameraEvent(
  baseUrl: string,
  token: string,
  event: LocalMotionEvent,
  ffmpegPath: string,
) {
  const prepared = await prepareEventFramesForUpload(
    ffmpegPath,
    event,
  );
  const frames = prepared.frames;

  return requestJson<EventSubmissionResponse>(
    baseUrl,
    `/api/agent/cameras/${encodeURIComponent(event.cameraId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        eventId: event.eventId,
        sessionId: event.sessionId,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        localMetrics: {
          ...event.localMetrics,
          ...prepared.diagnostics,
        },
        frames,
      }),
    },
    300_000,
  );
}


export async function uploadClipToSignedUrl(
  signedUrl: string,
  filePath: string,
) {
  const target = new URL(signedUrl);
  if (target.protocol !== "https:") {
    throw new Error("A URL assinada do clipe não usa HTTPS.");
  }

  const bytes = await readFile(filePath);
  const body = new FormData();
  body.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "video/mp4" }),
    "clip.mp4",
  );
  body.append("cacheControl", "3600");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch(target, {
      method: "PUT",
      headers: { "x-upsert": "true" },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(
        `Upload do clipe falhou com HTTP ${response.status}: ${detail}`,
      );
    }
  } finally {
    clearTimeout(timer);
  }

  return {
    byteSize: bytes.length,
    contentSha256: createHash("sha256")
      .update(bytes)
      .digest("hex"),
  };
}

export async function completeClipRequest(
  baseUrl: string,
  token: string,
  requestId: string,
  body: JsonObject,
) {
  return requestJson<{ ok: true }>(
    baseUrl,
    `/api/agent/clips/${encodeURIComponent(requestId)}/complete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    },
    30_000,
  );
}
