import { readFile } from "node:fs/promises";
import type {
  CapturedFrame,
  ConfigResponse,
  PairResponse,
} from "./types.js";

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
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
      const code =
        data && typeof data.error === "string"
          ? data.error
          : null;
      throw new ApiError(
        `A API retornou HTTP ${response.status}${code ? ` (${code})` : ""}.`,
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

export async function fetchAgentConfig(baseUrl: string, token: string) {
  return requestJson<ConfigResponse>(baseUrl, "/api/agent/config", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
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
  }>(baseUrl, `/api/agent/cameras/${encodeURIComponent(cameraId)}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
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
        ...(frame.width ? { "X-MonitorIA-Width": String(frame.width) } : {}),
        ...(frame.height ? { "X-MonitorIA-Height": String(frame.height) } : {}),
        ...(streamLabel ? { "X-MonitorIA-Stream-Label": streamLabel } : {}),
      },
      body: bytes,
    },
    30_000,
  );
}
