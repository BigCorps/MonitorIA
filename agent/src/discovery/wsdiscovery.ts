import dgram from "node:dgram";
import os from "node:os";
import { createHash } from "node:crypto";
import { NS, decodeXml, newMessageId, tagValue, tagValues } from "./soap.js";
import type { DiscoveredDevice } from "./types.js";

/**
 * WS-Discovery ONVIF.
 *
 * Decisão importante: não usamos addMembership em lugar nenhum.
 *
 * Entrar num grupo multicast só é necessário para RECEBER tráfego multicast.
 * Nós apenas enviamos o Probe para 239.255.255.250:3702, e os dispositivos
 * respondem em unicast para a porta efêmera de origem — a resposta chega por
 * caminho normal. Isso evita addMembership, que tem falha de segmentação
 * reportada no runtime que compila o Agent. Segfault derrubaria o serviço
 * inteiro e entraria em laço de reinício na máquina do cliente.
 *
 * Superfície de dgram usada: createSocket, bind, setBroadcast, send, message.
 */

const MULTICAST_ADDRESS = "239.255.255.250";
const DISCOVERY_PORT = 3702;
const PROBE_TIMEOUT_MS = 6_000;
/** Repetição por perda de datagrama, que em UDP é normal e não é erro. */
const PROBE_ATTEMPTS = 3;
const PROBE_INTERVAL_MS = 1_200;

function probeMessage() {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<s:Envelope xmlns:s="${NS.soap}" xmlns:a="${NS.wsa}" xmlns:d="${NS.wsd}" ` +
    `xmlns:dn="http://www.onvif.org/ver10/network/wsdl">` +
    `<s:Header>` +
    `<a:MessageID>${newMessageId()}</a:MessageID>` +
    `<a:To s:mustUnderstand="1">urn:schemas-xmlsoap-org:ws:2005:04:discovery</a:To>` +
    `<a:Action s:mustUnderstand="1">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</a:Action>` +
    `</s:Header>` +
    `<s:Body>` +
    `<d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>` +
    `</s:Body>` +
    `</s:Envelope>`
  );
}

/** Endereços de broadcast das interfaces IPv4 ativas. */
function broadcastAddresses() {
  const addresses: string[] = [];

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;

      const ip = entry.address.split(".").map(Number);
      const mask = entry.netmask.split(".").map(Number);
      if (ip.length !== 4 || mask.length !== 4) continue;

      const broadcast = ip.map((octet, index) => {
        const maskOctet = mask[index] ?? 255;
        return (octet & maskOctet) | (~maskOctet & 255);
      });

      addresses.push(broadcast.join("."));
    }
  }

  return [...new Set(addresses)];
}

function scopeValue(scopes: string[], key: string) {
  const prefix = `onvif://www.onvif.org/${key}/`;

  for (const scope of scopes) {
    if (scope.startsWith(prefix)) {
      return decodeURIComponent(scope.slice(prefix.length)).trim() || null;
    }
  }

  return null;
}

function parseProbeMatch(xml: string, remoteAddress: string): DiscoveredDevice | null {
  const xaddrs = tagValue(xml, "XAddrs");
  if (!xaddrs) return null;

  const serviceUrls = decodeXml(xaddrs)
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (serviceUrls.length === 0) return null;

  const scopes = (tagValue(xml, "Scopes") ?? "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  // O endereço de onde o datagrama veio é mais confiável que o host da XAddr:
  // firmwares com IP mal configurado anunciam endereço inalcançável.
  const address = tagValues(xml, "Address")[0] ?? remoteAddress;
  const id = createHash("sha1").update(`${remoteAddress}|${address}`).digest("hex").slice(0, 16);

  return {
    id,
    host: remoteAddress,
    serviceUrls,
    scopes,
    vendorHint: scopeValue(scopes, "manufacturer") ?? scopeValue(scopes, "name"),
    nameHint: scopeValue(scopes, "name"),
    hardwareHint: scopeValue(scopes, "hardware"),
    discoveredAt: new Date().toISOString(),
    source: "wsdiscovery",
  };
}

export async function probeOnvifDevices(options?: {
  timeoutMs?: number;
  log?: (message: string) => void;
}): Promise<DiscoveredDevice[]> {
  const timeout = options?.timeoutMs ?? PROBE_TIMEOUT_MS;
  const log = options?.log ?? (() => undefined);
  const found = new Map<string, DiscoveredDevice>();

  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const attemptTimers: NodeJS.Timeout[] = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      for (const attemptTimer of attemptTimers) clearTimeout(attemptTimer);

      try {
        socket.close();
      } catch {
        // Socket já fechado.
      }

      resolve([...found.values()]);
    };

    socket.on("error", (error) => {
      log(`Falha no WS-Discovery: ${error.message}`);
      finish();
    });

    socket.on("message", (buffer, remote) => {
      const xml = buffer.toString("utf8");
      if (!xml.includes("ProbeMatch")) return;

      const device = parseProbeMatch(xml, remote.address);
      if (!device) return;

      if (!found.has(device.id)) {
        found.set(device.id, device);
        log(`Dispositivo ONVIF encontrado em ${device.host}.`);
      }
    });

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true);
      } catch {
        // Sem permissão de broadcast, o multicast ainda costuma funcionar.
      }

      const targets = [MULTICAST_ADDRESS, ...broadcastAddresses()];

      const sendProbe = () => {
        const payload = Buffer.from(probeMessage(), "utf8");

        for (const target of targets) {
          socket.send(payload, DISCOVERY_PORT, target, (error) => {
            if (error) log(`Probe para ${target} falhou: ${error.message}`);
          });
        }
      };

      sendProbe();

      for (let attempt = 1; attempt < PROBE_ATTEMPTS; attempt += 1) {
        attemptTimers.push(setTimeout(sendProbe, attempt * PROBE_INTERVAL_MS));
      }

      timer = setTimeout(finish, timeout);
    });
  });
}
