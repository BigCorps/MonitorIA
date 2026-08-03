import net from "node:net";
import { randomUUID } from "node:crypto";
import {
  AgentAccessDeniedError,
  AgentNotRunningError,
  readEndpoint,
} from "./ipc-endpoint.js";
import {
  IPC_MAX_LINE_BYTES,
  IPC_PROTOCOL_VERSION,
  type IpcCommand,
  type IpcResponse,
} from "./ipc-protocol.js";

/**
 * Cliente do canal local.
 *
 * Abre a conexão, envia uma requisição, espera a resposta e fecha. Não há
 * conexão persistente: os comandos da interface local são pontuais e a
 * simplicidade vale mais que o custo de reconectar.
 */

const CONNECT_TIMEOUT_MS = 5_000;
const RESPONSE_TIMEOUT_MS = 120_000;

export async function callAgent(
  command: IpcCommand,
  payload: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const endpoint = await readEndpoint();
  const id = randomUUID();

  return new Promise((resolve, reject) => {
    const socket =
      endpoint.transport === "tcp"
        ? net.createConnection({ host: endpoint.host, port: endpoint.port })
        : net.createConnection(endpoint.path);

    let buffer = "";
    let settled = false;
    let responseTimer: NodeJS.Timeout | undefined;

    const connectTimer = setTimeout(() => {
      finish(new AgentNotRunningError());
    }, CONNECT_TIMEOUT_MS);

    function finish(error: Error | null, value?: Record<string, unknown>) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      if (responseTimer) clearTimeout(responseTimer);
      socket.destroy();
      if (error) reject(error);
      else resolve(value ?? {});
    }

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      clearTimeout(connectTimer);

      responseTimer = setTimeout(() => {
        finish(new Error("O serviço MonitorIA não respondeu a tempo."));
      }, RESPONSE_TIMEOUT_MS);

      socket.write(
        `${JSON.stringify({
          protocol: IPC_PROTOCOL_VERSION,
          id,
          token: endpoint.token,
          command,
          payload,
        })}\n`,
      );
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      if (Buffer.byteLength(buffer, "utf8") > IPC_MAX_LINE_BYTES) {
        finish(new Error("Resposta do serviço excedeu o limite aceito."));
        return;
      }

      const newline = buffer.indexOf("\n");
      if (newline < 0) return;

      let parsed: IpcResponse;

      try {
        parsed = JSON.parse(buffer.slice(0, newline).trim()) as IpcResponse;
      } catch {
        finish(new Error("Resposta inválida do serviço MonitorIA."));
        return;
      }

      if (parsed.ok) {
        finish(null, parsed.data);
        return;
      }

      finish(new Error(parsed.message));
    });

    socket.on("error", (error: NodeJS.ErrnoException) => {
      // ECONNREFUSED / ENOENT: o serviço caiu depois de publicar o ipc.json.
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") {
        finish(new AgentNotRunningError());
        return;
      }

      if (error.code === "EACCES" || error.code === "EPERM") {
        finish(new AgentAccessDeniedError());
        return;
      }

      finish(error);
    });

    socket.on("close", () => {
      finish(new Error("O serviço MonitorIA encerrou a conexão sem responder."));
    });
  });
}

export { AgentAccessDeniedError, AgentNotRunningError };
