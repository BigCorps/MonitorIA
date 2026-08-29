import { prepareEventFramesForUpload } from "../evidence-budget.js";
import { ApiError } from "../api.js";
import type { EventSubmissionResponse, LocalMotionEvent } from "../types.js";

const MAX_REDIRECTS = 3;

/**
 * Origem canônica da API do MonitorIA.
 *
 * A produção redireciona www.monitoria.cam para monitoria.cam. Normalizar
 * aqui evita um salto em cada requisição da 1.0.2 e, principalmente, impede
 * que novos workers usem fetch direto com uma origem antiga gravada no
 * agent.json.
 */
export function normalizeAgentApiBaseUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");

  try {
    const parsed = new URL(normalized);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname.toLowerCase() === "monitoria.cam" ||
        parsed.hostname.toLowerCase() === "www.monitoria.cam")
    ) {
      return "https://monitoria.cam";
    }
  } catch {
    // A validação definitiva continua sendo feita pelo fetch.
  }

  return normalized;
}

function registrableDomain(host: string) {
  return host.toLowerCase().split(".").slice(-2).join(".");
}

async function parseJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Transporte autenticado comum da 1.0.2.
 *
 * Todas as chamadas novas do runtime devem passar por aqui. Redirecionamentos
 * do mesmo domínio registrável preservam Authorization; redirecionamentos
 * para terceiros removem a credencial antes do próximo salto.
 */
export async function requestAgentJsonV102<T>(
  baseUrl: string,
  token: string,
  pathName: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let target = `${normalizeAgentApiBaseUrl(baseUrl)}${pathName}`;
  let requestInit = { ...init };
  let headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    ...((init.headers as Record<string, string>) ?? {}),
  };

  try {
    let response: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(target, {
        ...requestInit,
        headers,
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

      if (
        (response.status === 302 || response.status === 303) &&
        requestInit.method &&
        requestInit.method !== "GET" &&
        requestInit.method !== "HEAD"
      ) {
        const { body: _removedBody, ...withoutBody } = requestInit;
        requestInit = { ...withoutBody, method: "GET" };
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

    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Um evento da fila pode ter sobrevivido à troca/reparo do computador.
 * Nesse caso o eventId, os frames e o vídeo continuam válidos, mas a sessão
 * de captura pertence ao Agent anterior. O backend recusa apenas essa sessão
 * com 400 invalid_capture_session; repetir sem sessionId preserva o evento e
 * deixa o backend vinculá-lo à identidade atual sem enfraquecer autenticação.
 */
export function shouldRecoverInvalidCaptureSessionV102(
  error: unknown,
  sessionId: string | null | undefined,
) {
  return Boolean(sessionId) &&
    error instanceof ApiError &&
    error.status === 400 &&
    error.code === "invalid_capture_session";
}

/**
 * Transporte oficial do Agent 1.0.2 para acontecimentos.
 *
 * O endpoint v2 responde após a persistência durável (202) e nunca espera a
 * IA nem o vídeo. Compartilha o mesmo transporte seguro usado pelos workers
 * de clipe e compatibilidade para impedir regressões de Authorization.
 */
export async function submitCameraEventV102(
  baseUrl: string,
  token: string,
  event: LocalMotionEvent,
  ffmpegPath: string,
): Promise<EventSubmissionResponse> {
  const prepared = await prepareEventFramesForUpload(ffmpegPath, event);

  const submit = (
    sessionId: string | null,
    recoveredAfterAgentRepair: boolean,
  ) => requestAgentJsonV102<EventSubmissionResponse>(
    baseUrl,
    token,
    `/api/agent/v2/cameras/${encodeURIComponent(event.cameraId)}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        eventId: event.eventId,
        sessionId,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        localMetrics: {
          ...event.localMetrics,
          ...prepared.diagnostics,
          ...(recoveredAfterAgentRepair
            ? { captureSessionRecovery: "agent_repair" }
            : {}),
        },
        frames: prepared.frames,
      }),
    },
    90_000,
  );

  try {
    return await submit(event.sessionId ?? null, false);
  } catch (error) {
    if (!shouldRecoverInvalidCaptureSessionV102(error, event.sessionId)) {
      throw error;
    }

    // Não altera o item durável: o mesmo eventId/evidência é reenviado apenas
    // sem a referência de sessão que ficou obsoleta após o re-pareamento.
    return submit(null, true);
  }
}
