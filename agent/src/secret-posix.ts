import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCallback,
} from "node:crypto";
import { promisify } from "node:util";
import { machineEntropy } from "./paths.js";

/**
 * Backend POSIX do cofre: AES-256-GCM.
 *
 * O Windows tem DPAPI, que delega a proteção ao sistema operacional. Linux e
 * macOS não têm equivalente disponível sem dependência nativa, então a
 * proteção é feita aqui: chave derivada por scrypt a partir da entropia da
 * máquina, que vive em arquivo com permissão 0600 dentro de diretório 0700.
 *
 * O modelo de ameaça é o mesmo do DPAPI com escopo de máquina: protege contra
 * cópia do diretório de dados para outro computador e contra leitura por
 * usuário sem privilégio. Não protege contra root, que já é dono da máquina.
 *
 * O macOS poderia usar o Keychain pelo binário `security`, o que seria mais
 * forte. Ficou de fora por ora porque macOS não está no alvo comercial e
 * acrescentaria um caminho de código sem cliente para exercitá-lo.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const PREFIX = "v2p:";
const SALT = "monitoria-agent-secret-v2";
const IV_BYTES = 12;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

async function derivedKey() {
  if (cachedKey) return cachedKey;

  const entropy = await machineEntropy();
  cachedKey = await scrypt(entropy, SALT, 32);
  return cachedKey;
}

export function isPosixSecret(stored: string) {
  return stored.trim().startsWith(PREFIX);
}

export async function protectPosix(plain: string) {
  const key = await derivedKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plain, "utf8")),
    cipher.final(),
  ]);

  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  return `${PREFIX}${payload.toString("base64")}`;
}

export async function revealPosix(stored: string) {
  const payload = Buffer.from(stored.trim().slice(PREFIX.length), "base64");

  if (payload.length <= IV_BYTES + TAG_BYTES) {
    throw new Error("O segredo armazenado está truncado.");
  }

  const key = await derivedKey();
  const iv = payload.subarray(0, IV_BYTES);
  const tag = payload.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = payload.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    // GCM falha na verificação de integridade quando a chave mudou ou o dado
    // foi adulterado. Os dois casos exigem novo pareamento.
    throw new Error(
      "O segredo não pôde ser aberto. O arquivo de entropia mudou ou os dados " +
        "vieram de outro computador.",
    );
  }
}

/** Invalida a chave derivada. Usado quando a entropia é recriada. */
export function forgetDerivedKey() {
  cachedKey = null;
}
