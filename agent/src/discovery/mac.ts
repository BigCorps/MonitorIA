import { exec } from "node:child_process";

/**
 * Endereço físico de um aparelho da rede local.
 *
 * O MonitorIA guarda a URL de vídeo com o IP dentro. Quando o roteador
 * reinicia — e mercado tem queda de luz — o DHCP pode entregar outro
 * endereço à mesma câmera, e ela vira uma câmera offline sem que ninguém
 * tenha tocado em nada. O MAC não muda, então é por ele que a câmera é
 * reencontrada.
 *
 * Vale só na mesma rede: aparelho atrás de outro roteador não aparece na
 * tabela ARP, e nesse caso não há o que recuperar por aqui.
 */

const ARP_TIMEOUT_MS = 4_000;

function run(command: string): Promise<string> {
  return new Promise((resolve) => {
    const child = exec(
      command,
      { timeout: ARP_TIMEOUT_MS, windowsHide: true },
      (error, stdout) => resolve(error && !stdout ? "" : stdout),
    );

    child.on("error", () => resolve(""));
  });
}

/** Normaliza para minúsculas com dois-pontos: 3c:0b:59:37:99:50. */
export function normalizeMac(value: string | null | undefined) {
  if (!value) return null;

  const limpo = value.trim().toLowerCase().replace(/[^0-9a-f]/g, "");
  if (limpo.length !== 12) return null;

  // Difusão e endereço nulo não identificam aparelho algum.
  if (limpo === "ffffffffffff" || limpo === "000000000000") return null;

  return (limpo.match(/.{2}/g) ?? []).join(":");
}

function extractMac(saida: string, host: string) {
  for (const linha of saida.split(/\r?\n/)) {
    if (!linha.includes(host)) continue;

    const encontrado = linha.match(
      /([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i,
    )?.[0];

    const normalizado = normalizeMac(encontrado);
    if (normalizado) return normalizado;
  }

  return null;
}

/**
 * Devolve null quando o aparelho não está na tabela ARP.
 *
 * Nunca lança: descoberta de câmera não pode falhar porque a leitura de MAC
 * não funcionou. Sem MAC, a câmera continua sendo salva pelo IP como antes.
 */
export async function macForHost(host: string): Promise<string | null> {
  if (!host) return null;

  if (process.platform === "win32") {
    const saida = await run(`arp -a ${host}`);
    return extractMac(saida, host);
  }

  const vizinhos = await run(`ip neigh show ${host}`);
  const doIpNeigh = extractMac(vizinhos, host);
  if (doIpNeigh) return doIpNeigh;

  const arp = await run(`arp -n ${host}`);
  return extractMac(arp, host);
}

/**
 * Endereços da rede local que respondem ao MAC informado.
 *
 * Lê a tabela ARP inteira. Quem chama deve provocar tráfego antes — um ping
 * na faixa, por exemplo — porque a tabela só contém quem foi contactado
 * recentemente.
 */
export async function hostsForMac(mac: string): Promise<string[]> {
  const alvo = normalizeMac(mac);
  if (!alvo) return [];

  const saida =
    process.platform === "win32"
      ? await run("arp -a")
      : ((await run("ip neigh show")) || (await run("arp -n")));

  const encontrados: string[] = [];

  for (const linha of saida.split(/\r?\n/)) {
    const macDaLinha = normalizeMac(
      linha.match(/([0-9a-f]{2}[:-]){5}[0-9a-f]{2}/i)?.[0],
    );

    if (macDaLinha !== alvo) continue;

    const ip = linha.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/)?.[1];
    if (ip) encontrados.push(ip);
  }

  return [...new Set(encontrados)];
}
