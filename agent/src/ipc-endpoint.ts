import { randomBytes } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { resolvePaths, writeFileAtomic } from "./paths.js";

/**
 * Endereço do canal local, publicado pelo serviço e lido pela interface.
 *
 * O transporte padrão é TCP em loopback com porta efêmera. Named pipe seria
 * preferível — não abre porta alguma —, mas o suporte a named pipe do Windows
 * no runtime do Bun tem falhas abertas, incluindo casos em que o servidor
 * sobe sem erro e simplesmente não aceita conexão. Falha silenciosa em
 * máquina de cliente é o pior modo de falha possível, então o padrão é TCP.
 *
 * A escolha fica atrás desta abstração de propósito: quando o pipe for
 * confiável, basta definir MONITORIA_IPC=pipe. Nenhum outro arquivo do Agent
 * conhece o transporte.
 *
 * Por que loopback é aceitável aqui:
 *
 * - o bind é em 127.0.0.1, inalcançável pela rede da loja
 * - a porta é sorteada a cada boot, então não há alvo fixo
 * - porta e token vivem em ipc.json, com ACL de SYSTEM e Administradores
 * - o token é regenerado a cada início do serviço, invalidando cópias velhas
 */

export const IPC_PIPE_PATH = "\\\\.\\pipe\\MonitorIA.Agent";

export type IpcTransport = "tcp" | "pipe";

export type IpcEndpoint =
  | { transport: "tcp"; host: string; port: number; token: string }
  | { transport: "pipe"; path: string; token: string };

export class AgentNotRunningError extends Error {
  constructor() {
    super(
      "O serviço MonitorIA não está em execução. " +
        'Abra os Serviços do Windows e inicie "MonitorIA Agent".',
    );
    this.name = "AgentNotRunningError";
  }
}

export class AgentAccessDeniedError extends Error {
  constructor() {
    super(
      "Sem permissão para falar com o serviço MonitorIA. " +
        "Execute este comando como administrador.",
    );
    this.name = "AgentAccessDeniedError";
  }
}

/** Transporte escolhido para esta execução. */
export function preferredTransport(): IpcTransport {
  return process.env.MONITORIA_IPC?.trim().toLowerCase() === "pipe" ? "pipe" : "tcp";
}

export function generateIpcToken() {
  return randomBytes(32).toString("base64");
}

function isEndpoint(value: unknown): value is IpcEndpoint {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<IpcEndpoint> & Record<string, unknown>;
  if (typeof candidate.token !== "string" || candidate.token.length < 16) return false;

  if (candidate.transport === "tcp") {
    return typeof candidate.host === "string" && typeof candidate.port === "number";
  }

  if (candidate.transport === "pipe") {
    return typeof candidate.path === "string" && candidate.path.length > 0;
  }

  return false;
}

/** Publica o endereço após o servidor começar a escutar. */
export async function publishEndpoint(endpoint: IpcEndpoint) {
  const layout = await resolvePaths();
  await writeFileAtomic(layout.ipcEndpointFile, `${JSON.stringify(endpoint, null, 2)}\n`);
}

/** Remove o endereço no encerramento, para o cliente falhar com clareza. */
export async function clearEndpoint() {
  const layout = await resolvePaths();
  await rm(layout.ipcEndpointFile, { force: true });
}

/**
 * Lê o endereço publicado.
 *
 * ENOENT significa serviço parado. EACCES significa que o processo atual não
 * tem elevação — os dois casos viram mensagens acionáveis em vez de stack
 * trace na cara do lojista.
 */
export async function readEndpoint(): Promise<IpcEndpoint> {
  const layout = await resolvePaths();

  let raw: string;

  try {
    raw = await readFile(layout.ipcEndpointFile, "utf8");
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code === "ENOENT") throw new AgentNotRunningError();
    if (code === "EACCES" || code === "EPERM") throw new AgentAccessDeniedError();
    throw error;
  }

  const parsed: unknown = JSON.parse(raw);

  if (!isEndpoint(parsed)) {
    throw new Error(
      "O arquivo ipc.json está corrompido. Reinicie o serviço MonitorIA para recriá-lo.",
    );
  }

  return parsed;
}
