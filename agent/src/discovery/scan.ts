import net from "node:net";
import os from "node:os";
import { createHash } from "node:crypto";
import { RTSP_PORTS } from "./catalog.js";
import type { DiscoveredDevice } from "./types.js";

/**
 * Varredura TCP da rede local.
 *
 * Segunda camada da descoberta, acionada quando o WS-Discovery não encontra
 * nada. Isso acontece mais do que parece: multicast não atravessa VLAN, é
 * bloqueado em rede de convidados, e vários firmwares simplesmente não
 * respondem ao Probe mesmo tendo ONVIF.
 *
 * O que fazemos aqui é apenas abrir e fechar conexão TCP para saber se a
 * porta atende. Nenhuma credencial é enviada e nenhuma senha é testada — o
 * Agent nunca tenta adivinhar senha de equipamento na rede, mesmo que isso
 * aumentasse a taxa de sucesso. Sondar aparelho de terceiro numa rede
 * compartilhada seria indefensável num produto de segurança.
 */

const PROBE_TIMEOUT_MS = 900;
const CONCURRENCY = 64;
/** Teto de hosts por interface, para não varrer /16 inteiro. */
const MAX_HOSTS = 254;

type ScanTarget = { host: string; port: number };

function ipToNumber(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return null;

  return (
    ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)
  );
}

function numberToIp(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

/**
 * Hosts candidatos das interfaces IPv4 ativas.
 *
 * Redes maiores que /24 são reduzidas ao /24 em torno do IP local. Varrer um
 * /16 seriam 65 mil hosts, o que levaria minutos e pareceria varredura
 * hostil para qualquer monitoramento de rede do cliente.
 */
export function localHosts(): string[] {
  const hosts = new Set<string>();

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;

      const address = ipToNumber(entry.address);
      const mask = ipToNumber(entry.netmask);
      if (address === null || mask === null) continue;

      const effectiveMask = Math.max(mask >>> 0, 0xffffff00);
      const network = (address & effectiveMask) >>> 0;
      const size = (~effectiveMask >>> 0) + 1;

      for (let offset = 1; offset < Math.min(size - 1, MAX_HOSTS + 1); offset += 1) {
        const candidate = numberToIp((network + offset) >>> 0);
        if (candidate !== entry.address) hosts.add(candidate);
      }
    }
  }

  return [...hosts];
}

function probePort(host: string, port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (open: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

/** Executa as sondagens com pool fixo, para não abrir 1200 sockets de uma vez. */
async function runPool(targets: ScanTarget[], onOpen: (target: ScanTarget) => void) {
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;

      const target = targets[index];
      if (!target) continue;

      if (await probePort(target.host, target.port)) onOpen(target);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()),
  );
}

/**
 * Portas RTSP abertas num host específico.
 *
 * Existe para cortar a explosão combinatória da descoberta. Antes, cada
 * caminho do catálogo era testado em todas as cinco portas conhecidas: dez
 * caminhos viravam cinquenta tentativas de stream por aparelho, cada uma com
 * DESCRIBE, ffprobe e decodificação. O log de produção mostrou quase dois
 * minutos por câmera.
 *
 * Sondando as portas uma vez, o número cai para os caminhos vezes as portas
 * realmente abertas — quase sempre uma.
 */
export async function openRtspPorts(
  host: string,
  ports: readonly number[] = RTSP_PORTS,
) {
  const abertas: number[] = [];

  await Promise.all(
    ports.map(async (port) => {
      if (await probePort(host, port)) abertas.push(port);
    }),
  );

  return abertas.sort((a, b) => a - b);
}

export async function scanLocalNetwork(options?: {
  ports?: readonly number[];
  hosts?: string[];
  log?: (message: string) => void;
}): Promise<DiscoveredDevice[]> {
  const ports = options?.ports ?? RTSP_PORTS;
  const hosts = options?.hosts ?? localHosts();
  const log = options?.log ?? (() => undefined);

  if (hosts.length === 0) {
    log("Nenhuma interface de rede local utilizável para varredura.");
    return [];
  }

  const targets: ScanTarget[] = [];
  for (const host of hosts) {
    for (const port of ports) targets.push({ host, port });
  }

  log(`Varrendo ${hosts.length} endereço(s) em ${ports.length} porta(s).`);

  const openPorts = new Map<string, number[]>();

  await runPool(targets, ({ host, port }) => {
    const existing = openPorts.get(host);
    if (existing) existing.push(port);
    else openPorts.set(host, [port]);
  });

  const devices: DiscoveredDevice[] = [];

  for (const [host, found] of openPorts) {
    devices.push({
      id: createHash("sha1").update(`scan|${host}`).digest("hex").slice(0, 16),
      host,
      // A varredura não conhece o endereço do serviço ONVIF. O orquestrador
      // tenta os caminhos usuais depois, se precisar.
      serviceUrls: [],
      scopes: [],
      vendorHint: null,
      nameHint: null,
      hardwareHint: null,
      discoveredAt: new Date().toISOString(),
      source: "portscan",
    });

    log(`Aparelho em ${host} com porta(s) ${found.sort((a, b) => a - b).join(", ")}.`);
  }

  return devices;
}
