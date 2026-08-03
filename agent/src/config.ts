import { readFile, rm } from "node:fs/promises";
import { resolvePaths, writeFileAtomic } from "./paths.js";
import type { StoredAgentConfig } from "./types.js";

/**
 * Persistência da configuração local.
 *
 * Três mudanças em relação à versão anterior:
 *
 * 1. LOCALAPPDATA saiu da lista de candidatos. Um serviço rodando como
 *    LocalSystem tem LOCALAPPDATA apontando para o perfil da conta de
 *    sistema, então o Agent instalado como serviço leria uma pasta diferente
 *    da que o instalador escreveu e apareceria como não pareado.
 *
 * 2. A gravação virou atômica de verdade. A versão anterior apagava o arquivo
 *    de destino antes de regravá-lo: uma queda de energia entre as duas
 *    operações deixava a loja sem configuração e sem token, exigindo novo
 *    pareamento presencial.
 *
 * 3. O schema passou a registrar em que escopo os segredos foram protegidos,
 *    para o cofre saber quando migrar.
 */

export const CURRENT_SCHEMA_VERSION = 2;

export type SecretScope = "current-user" | "local-machine";

export type StoredAgentConfigV2 = Omit<StoredAgentConfig, "schemaVersion"> & {
  schemaVersion: 2;
  secretScope: SecretScope;
};

export async function configPath() {
  return (await resolvePaths()).configFile;
}

export async function resolveConfigDirectory() {
  return (await resolvePaths()).root;
}

function hasBaseFields(candidate: Partial<StoredAgentConfigV2>) {
  return (
    typeof candidate.apiBaseUrl === "string" &&
    typeof candidate.agentId === "string" &&
    typeof candidate.agentName === "string" &&
    typeof candidate.protectedAgentToken === "string" &&
    typeof candidate.pairedAt === "string" &&
    Boolean(candidate.cameras) &&
    typeof candidate.cameras === "object"
  );
}

/**
 * Aceita o schema 1 e o 2.
 *
 * O schema 1 é convertido em memória com `secretScope: "current-user"`. O
 * arquivo em disco só é reescrito quando o cofre conseguir de fato decifrar
 * e reproteger os segredos — converter antes disso marcaria como migrado
 * algo que ainda está no formato antigo.
 */
function normalize(value: unknown): StoredAgentConfigV2 {
  if (!value || typeof value !== "object") {
    throw new Error("Configuração local inválida.");
  }

  const candidate = value as Partial<StoredAgentConfigV2>;

  if (!hasBaseFields(candidate)) {
    throw new Error("Configuração local incompatível.");
  }

  if (candidate.schemaVersion === 2) {
    const scope: SecretScope =
      candidate.secretScope === "current-user" ? "current-user" : "local-machine";

    return { ...(candidate as StoredAgentConfigV2), schemaVersion: 2, secretScope: scope };
  }

  if ((candidate as { schemaVersion?: unknown }).schemaVersion === 1) {
    return {
      ...(candidate as unknown as StoredAgentConfigV2),
      schemaVersion: 2,
      secretScope: "current-user",
    };
  }

  throw new Error("Versão de configuração local não reconhecida.");
}

export async function loadConfig(): Promise<StoredAgentConfigV2 | null> {
  const file = await configPath();

  try {
    const raw = await readFile(file, "utf8");
    return normalize(JSON.parse(raw) as unknown);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code === "ENOENT") return null;
    throw error;
  }
}

export async function saveConfig(config: StoredAgentConfigV2) {
  const file = await configPath();
  await writeFileAtomic(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

export async function removeConfig() {
  await rm(await configPath(), { force: true });
}
