/**
 * Protocolo do canal local entre a interface e o serviço.
 *
 * Framing: uma mensagem por linha, JSON, terminada em \n. Simples de
 * inspecionar e sem dependência externa. O limite de linha existe para um
 * cliente defeituoso não conseguir esgotar a memória do serviço.
 */

export const IPC_MAX_LINE_BYTES = 1_048_576;
export const IPC_IDLE_TIMEOUT_MS = 30_000;
export const IPC_PROTOCOL_VERSION = 1;

export type IpcCommand =
  /** Situação resumida, sem tocar a rede. */
  | "status"
  /** Diagnóstico local completo: disco, ACL, FFmpeg, fila, relógio. */
  | "diagnose"
  /** Pareia o Agent com o código de 8 dígitos gerado no painel. */
  | "pair"
  /** Remove o pareamento e apaga os segredos. */
  | "unpair"
  /** Lista as câmeras conhecidas e o estado de cada uma. */
  | "camera.list"
  /** Grava a URL RTSP de uma câmera, protegida por DPAPI. */
  | "camera.set-rtsp"
  /** Estatísticas da fila persistente de eventos. */
  | "queue.stats"
  /** Força a sincronização de configuração com o painel. */
  | "sync"
  /** Varre a rede e valida os streams encontrados. Demorado. */
  | "discovery.scan"
  /** Devolve o resultado da última varredura, sem repeti-la. */
  | "discovery.results"
  /** Vincula um stream validado a uma câmera do painel. */
  | "discovery.bind";

export type IpcRequest = {
  protocol: number;
  id: string;
  token: string;
  command: IpcCommand;
  payload?: Record<string, unknown>;
};

export type IpcErrorCode =
  | "unauthorized"
  | "bad_request"
  | "unknown_command"
  | "not_paired"
  | "internal"
  | "busy";

export type IpcResponse =
  | { protocol: number; id: string; ok: true; data: Record<string, unknown> }
  | { protocol: number; id: string; ok: false; code: IpcErrorCode; message: string };

export type IpcHandler = (
  payload: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export type IpcHandlerMap = Partial<Record<IpcCommand, IpcHandler>>;

/** Erro que o handler lança para devolver um código específico ao cliente. */
export class IpcError extends Error {
  constructor(
    readonly code: IpcErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IpcError";
  }
}

export function isIpcRequest(value: unknown): value is IpcRequest {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<IpcRequest>;

  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.token === "string" &&
    typeof candidate.command === "string" &&
    (candidate.payload === undefined || typeof candidate.payload === "object")
  );
}
