import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Cifra do usuário e senha das câmeras enquanto o pedido de busca espera.
 *
 * Até esta fase, a senha da câmera nunca chegava ao servidor: o instalador
 * coletava na máquina da loja e o Agent protegia com DPAPI. Levar a busca
 * para o painel obriga a senha a atravessar o servidor.
 *
 * O acordo é reduzir a janela ao mínimo: o valor entra cifrado com
 * AES-256-GCM, só a aplicação tem a chave, e o campo `credentials_sealed` é
 * zerado assim que a busca termina, por qualquer desfecho. O armazenamento
 * durável continua sendo apenas o cofre local do Windows.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class DiscoveryKeyMissingError extends Error {
  constructor() {
    super(
      "MONITORIA_DISCOVERY_KEY ausente ou com menos de 32 caracteres. " +
        "A busca de câmeras pelo painel fica indisponível sem ela.",
    );
  }
}

function derivedKey() {
  const raw = process.env.MONITORIA_DISCOVERY_KEY?.trim();
  if (!raw || raw.length < 32) throw new DiscoveryKeyMissingError();
  return createHash("sha256").update(raw).digest();
}

/** Diz se a chave existe, sem lançar. Usado para desabilitar a tela. */
export function discoveryKeyConfigured() {
  const raw = process.env.MONITORIA_DISCOVERY_KEY?.trim();
  return Boolean(raw && raw.length >= 32);
}

export type DiscoveryCredentials = {
  username: string;
  password: string;
};

export function sealCredentials(value: DiscoveryCredentials) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, derivedKey(), iv);

  const plain = Buffer.from(
    JSON.stringify({
      username: String(value.username ?? ""),
      password: String(value.password ?? ""),
    }),
    "utf8",
  );

  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

/**
 * Devolve null quando o valor não abre — chave trocada, dado corrompido ou
 * campo já zerado. Quem chama trata como pedido inválido, sem vazar detalhe.
 */
export function openCredentials(
  sealed: string | null | undefined,
): DiscoveryCredentials | null {
  if (!sealed) return null;

  try {
    const buffer = Buffer.from(sealed, "base64");
    if (buffer.length <= IV_BYTES + TAG_BYTES) return null;

    const iv = buffer.subarray(0, IV_BYTES);
    const tag = buffer.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const payload = buffer.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, derivedKey(), iv);
    decipher.setAuthTag(tag);

    const plain = Buffer.concat([
      decipher.update(payload),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(plain) as Record<string, unknown>;

    return {
      username: typeof parsed.username === "string" ? parsed.username : "",
      password: typeof parsed.password === "string" ? parsed.password : "",
    };
  } catch {
    return null;
  }
}
