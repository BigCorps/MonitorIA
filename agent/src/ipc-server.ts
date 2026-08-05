import net from "node:net";
import { timingSafeEqual } from "node:crypto";
import {
  IPC_PIPE_PATH,
  clearEndpoint,
  generateIpcToken,
  preferredTransport,
  publishEndpoint,
  type IpcEndpoint,
} from "./ipc-endpoint.js";
import {
  IPC_IDLE_TIMEOUT_MS,
  IPC_MAX_LINE_BYTES,
  IPC_PROTOCOL_VERSION,
  IpcError,
  isIpcRequest,
  type IpcHandlerMap,
  type IpcResponse,
} from "./ipc-protocol.js";

/**
 * Canal local do Agent, executado dentro do serviço.
 *
 * Duas camadas de acesso:
 *
 * 1. O sistema de arquivos. Porta e token vivem em ipc.json, dentro da pasta
 *    com ACL de SYSTEM e Administradores. Usuário comum não descobre nem a
 *    porta nem o token.
 *
 * 2. O token em si, comparado em tempo constante e regenerado a cada início
 *    do serviço.
 *
 * Uma camada sozinha não bastaria: a porta em loopback é descobrível por
 * varredura local, e um arquivo protegido não impede quem já é administrador.
 * Juntas, cobrem o cenário realista de uma máquina de loja compartilhada.
 */

export type IpcServerHandle = {
  endpoint: IpcEndpoint;
  close: () => Promise<void>;
};

type Logger = (level: "info" | "warn" | "error", message: string) => void;

function safeCompare(received: string, expected: string) {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");

  // timingSafeEqual exige comprimentos iguais; comparar o tamanho antes
  // vaza apenas o tamanho do token, que não é segredo útil.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

function respond(socket: net.Socket, response: IpcResponse) {
  if (socket.destroyed) return;
  socket.write(`${JSON.stringify(response)}\n`);
}

export async function startIpcServer(
  handlers: IpcHandlerMap,
  log: Logger,
): Promise<IpcServerHandle> {
  const token = generateIpcToken();
  const transport = preferredTransport();

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.setTimeout(IPC_IDLE_TIMEOUT_MS);

    let buffer = "";

    /**
     * Requisições em andamento nesta conexão.
     *
     * O timeout existe para não acumular conexão ociosa, mas na versão
     * anterior ele derrubava a conexão mesmo com trabalho em curso: a
     * varredura de rede leva minutos sem trafegar byte nenhum, e o próprio
     * serviço matava o canal aos 30 segundos. O cliente reportava
     * "encerrou a conexão sem responder" enquanto o serviço seguia
     * trabalhando e gravando o resultado só no log.
     */
    let pending = 0;

    socket.on("timeout", () => {
      if (pending > 0) return;
      socket.destroy();
    });

    socket.on("error", () => {
      // Cliente encerrando abruptamente é rotina; não polui o log.
      socket.destroy();
    });

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      if (Buffer.byteLength(buffer, "utf8") > IPC_MAX_LINE_BYTES) {
        log("warn", "Mensagem local excedeu o limite e a conexão foi encerrada.");
        socket.destroy();
        return;
      }

      let newline = buffer.indexOf("\n");

      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (line.length > 0) {
          pending += 1;
          void handleLine(socket, line).finally(() => {
            pending -= 1;
          });
        }
      }
    });
  });

  async function handleLine(socket: net.Socket, line: string) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      respond(socket, {
        protocol: IPC_PROTOCOL_VERSION,
        id: "unknown",
        ok: false,
        code: "bad_request",
        message: "Mensagem inválida.",
      });
      return;
    }

    if (!isIpcRequest(parsed)) {
      respond(socket, {
        protocol: IPC_PROTOCOL_VERSION,
        id: "unknown",
        ok: false,
        code: "bad_request",
        message: "Formato de requisição não reconhecido.",
      });
      return;
    }

    if (!safeCompare(parsed.token, token)) {
      log("warn", `Requisição local rejeitada por token inválido: ${parsed.command}`);
      respond(socket, {
        protocol: IPC_PROTOCOL_VERSION,
        id: parsed.id,
        ok: false,
        code: "unauthorized",
        message: "Token local inválido.",
      });
      socket.destroy();
      return;
    }

    const handler = handlers[parsed.command];

    if (!handler) {
      respond(socket, {
        protocol: IPC_PROTOCOL_VERSION,
        id: parsed.id,
        ok: false,
        code: "unknown_command",
        message: `Comando não suportado: ${parsed.command}`,
      });
      return;
    }

    try {
      const data = await handler(parsed.payload ?? {});
      respond(socket, { protocol: IPC_PROTOCOL_VERSION, id: parsed.id, ok: true, data });
    } catch (error) {
      const isKnown = error instanceof IpcError;

      if (!isKnown) {
        log(
          "error",
          `Falha ao executar ${parsed.command}: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`,
        );
      }

      respond(socket, {
        protocol: IPC_PROTOCOL_VERSION,
        id: parsed.id,
        ok: false,
        code: isKnown ? error.code : "internal",
        message: isKnown ? error.message : "Falha interna do Agent.",
      });
    }
  }

  const endpoint = await new Promise<IpcEndpoint>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            "O canal local já está em uso. Provavelmente o serviço MonitorIA " +
              "já está rodando nesta máquina.",
          ),
        );
        return;
      }

      reject(error);
    });

    const onListening = () => {
      server.removeAllListeners("error");
      server.on("error", (error) => {
        log("error", `Erro no canal local: ${error.message}`);
      });

      if (transport === "pipe") {
        resolve({ transport: "pipe", path: IPC_PIPE_PATH, token });
        return;
      }

      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Não foi possível determinar a porta do canal local."));
        return;
      }

      resolve({ transport: "tcp", host: "127.0.0.1", port: address.port, token });
    };

    if (transport === "pipe") {
      server.listen(IPC_PIPE_PATH, onListening);
      return;
    }

    // Porta 0 pede uma porta efêmera ao sistema. O bind explícito em
    // 127.0.0.1 garante que nada fora da máquina alcance o canal.
    server.listen(0, "127.0.0.1", onListening);
  });

  await publishEndpoint(endpoint);

  log(
    "info",
    endpoint.transport === "tcp"
      ? `Canal local disponível em 127.0.0.1:${endpoint.port}`
      : `Canal local disponível em ${endpoint.path}`,
  );

  return {
    endpoint,
    close: async () => {
      await clearEndpoint().catch(() => undefined);
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
