import { isPosixSecret, protectPosix, revealPosix } from "./secret-posix.js";
import { protectWindows, revealWindows } from "./secret-windows.js";

/**
 * Cofre de segredos, com despacho por plataforma.
 *
 * O restante do Agent não sabe qual mecanismo está em uso — importa daqui e
 * pronto. Foi assim que a portabilidade para Linux virou adaptador em vez de
 * reescrita: descoberta, ONVIF, RTSP, fila e monitoramento não têm uma linha
 * de código específica de sistema operacional.
 *
 * Prefixos gravados:
 *
 *   v2:   DPAPI de máquina, com entropia    (Windows, atual)
 *   v2p:  AES-256-GCM, chave derivada       (Linux e macOS, atual)
 *   sem   DPAPI de usuário, sem entropia    (Windows, legado, só leitura)
 *
 * O prefixo torna o formato autodescritivo, então mover o diretório de dados
 * entre plataformas falha com mensagem clara em vez de lixo decifrado.
 */

export type RevealResult = {
  value: string;
  /** true quando o dado veio no formato antigo e precisa ser regravado. */
  legacy: boolean;
};

export function isWindows() {
  return process.platform === "win32";
}

export async function protectSecret(plain: string) {
  return isWindows() ? protectWindows(plain) : protectPosix(plain);
}

export async function revealSecret(stored: string): Promise<RevealResult> {
  const trimmed = stored.trim();

  if (isPosixSecret(trimmed)) {
    if (isWindows()) {
      throw new Error(
        "Este segredo foi gravado em Linux ou macOS e não pode ser aberto no Windows. " +
          "É necessário parear novamente neste computador.",
      );
    }

    return { value: await revealPosix(trimmed), legacy: false };
  }

  if (!isWindows()) {
    throw new Error(
      "Este segredo foi gravado no Windows e não pode ser aberto aqui. " +
        "É necessário parear novamente neste computador.",
    );
  }

  return revealWindows(trimmed);
}
