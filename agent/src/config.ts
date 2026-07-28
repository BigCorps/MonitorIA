import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import type { StoredAgentConfig } from "./types.js";

async function writableDirectory(candidate: string) {
  await mkdir(candidate, { recursive: true });
  await access(candidate, constants.R_OK | constants.W_OK);
  return candidate;
}

export async function resolveConfigDirectory() {
  const candidates = [
    process.env.MONITORIA_CONFIG_DIR,
    process.env.PROGRAMDATA ? path.join(process.env.PROGRAMDATA, "MonitorIA") : undefined,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "MonitorIA") : undefined,
    path.join(process.cwd(), ".monitoria"),
  ].filter((value): value is string => Boolean(value));

  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await writableDirectory(candidate);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Não foi possível criar a pasta de configuração: ${
      lastError instanceof Error ? lastError.message : "erro desconhecido"
    }`,
  );
}

export async function configPath() {
  return path.join(await resolveConfigDirectory(), "agent.json");
}

function assertConfig(value: unknown): asserts value is StoredAgentConfig {
  if (!value || typeof value !== "object") throw new Error("Configuração local inválida.");

  const candidate = value as Partial<StoredAgentConfig>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.apiBaseUrl !== "string" ||
    typeof candidate.agentId !== "string" ||
    typeof candidate.agentName !== "string" ||
    typeof candidate.protectedAgentToken !== "string" ||
    !candidate.cameras ||
    typeof candidate.cameras !== "object"
  ) {
    throw new Error("Configuração local incompatível.");
  }
}

export async function loadConfig(): Promise<StoredAgentConfig | null> {
  const file = await configPath();

  try {
    const raw = await readFile(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    assertConfig(parsed);
    return parsed;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

export async function saveConfig(config: StoredAgentConfig) {
  const file = await configPath();
  const temporary = `${file}.tmp`;

  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rm(file, { force: true });
  await writeFile(file, await readFile(temporary));
  await rm(temporary, { force: true });

  return file;
}

export async function removeConfig() {
  await rm(await configPath(), { force: true });
}
