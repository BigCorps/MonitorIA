import { callAgent } from "../ipc-client.js";

function bytes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

export function unauthorizedPairingMessageV103(everAuthenticated: boolean) {
  return everAuthenticated
    ? "ATENÇÃO: o token deste Agent foi recusado pelo servidor. Isso pode acontecer quando o pareamento foi removido ou substituído durante uma troca/reparo de computador. Gere um novo código pelo fluxo Trocar ou reparar computador no dashboard; não use reset."
    : "ATENÇÃO: o servidor recusou o token deste Agent. A causa pode ser troca/reparo de computador, token revogado ou endereço do servidor incorreto. Confirme o servidor e, se este computador estiver sendo reparado, gere um novo código pelo dashboard; não use reset."
}

/**
 * Status específico da 1.0.3.
 *
 * A CLI legada dizia que um token nunca autenticado era normalmente URL
 * errada e "não token revogado". O fluxo real Store <-> 24/7 provou que um
 * Agent substituído pode voltar exatamente nesse estado. A 1.0.3 mantém a
 * telemetria original, mas orienta reparo sem sugerir reset/unpair destrutivo.
 */
export async function runV103StatusCommand() {
  const status = await callAgent("status");
  const queue = (status.queue ?? {}) as Record<string, unknown>;

  console.log(`\nMonitorIA Agent v${String(status.version)}`);
  console.log(`Serviço no ar desde: ${String(status.startedAt)}`);
  console.log(`Pareado: ${status.paired ? "sim" : "não"}`);

  if (status.unauthorized) {
    console.log("");
    console.log(
      unauthorizedPairingMessageV103(Boolean(status.everAuthenticated)),
    );
  }

  if (status.paired) {
    console.log(`Nome: ${String(status.agentName)}`);
    console.log(`Servidor: ${String(status.apiBaseUrl)}`);
    console.log(`Último heartbeat: ${String(status.lastHeartbeatAt ?? "nunca")}`);
    console.log(`Última sincronização: ${String(status.lastSyncAt ?? "nunca")}`);
    console.log(
      `Câmeras: ${String(status.camerasRunning)} monitorando de ${String(status.camerasKnown)}`,
    );
  }

  console.log(`\nFila: ${String(queue.pending ?? 0)} evento(s), ${bytes(queue.totalBytes)}`);

  if (Number(queue.dropped ?? 0) > 0) {
    console.log(`Descartados por limite de disco ou idade: ${String(queue.dropped)}`);
  }

  if (Number(queue.rejected ?? 0) > 0) {
    console.log(
      `Recusas acumuladas pelo servidor: ${String(queue.rejected)} ` +
        "(contador histórico de tentativas, não quantidade de eventos na fila)",
    );
  }
}
