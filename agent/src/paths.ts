import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * Todo o estado do Agent vive em %PROGRAMDATA%\MonitorIA.
 *
 * Esta pasta é escrita pelo serviço, que roda como LocalSystem. A ACL é
 * fechada para SYSTEM e Administradores: um usuário comum da loja não lê o
 * endpoint do canal local nem a entropia do DPAPI, mesmo tendo acesso físico
 * ao computador.
 *
 * As SIDs abaixo são usadas em vez dos nomes ("Administrators") porque o
 * Windows em português nomeia o grupo como "Administradores" e o icacls
 * falharia com o nome em inglês.
 */
const SID_LOCAL_SYSTEM = "*S-1-5-18";
const SID_ADMINISTRATORS = "*S-1-5-32-544";

export type PathLayout = {
  root: string;
  configFile: string;
  entropyFile: string;
  /** ipc.json: transporte, porta e token do canal local. */
  ipcEndpointFile: string;
  queueDirectory: string;
  logDirectory: string;
  frameDirectory: string;
  /** false quando a ACL não pôde ser aplicada (execução sem elevação). */
  restricted: boolean;
};

let cached: PathLayout | null = null;

function candidateRoots() {
  const overridden = process.env.MONITORIA_CONFIG_DIR?.trim();
  const programData = process.env.PROGRAMDATA?.trim();

  // LOCALAPPDATA foi deliberadamente removido da lista. Um serviço rodando
  // como LocalSystem tem LOCALAPPDATA apontando para o perfil da conta de
  // sistema, e o Agent leria pasta diferente da que o instalador escreveu.
  if (process.platform !== "win32") {
    // /var/lib é o lugar canônico de estado de serviço em Linux, e o systemd
    // cria o diretório com dono e modo corretos via StateDirectory.
    return [
      overridden || undefined,
      "/var/lib/monitoria",
      path.join(os.homedir(), ".local", "share", "monitoria"),
      path.join(process.cwd(), ".monitoria"),
    ].filter((value): value is string => Boolean(value));
  }

  return [
    overridden || undefined,
    programData ? path.join(programData, "MonitorIA") : undefined,
    path.join(process.cwd(), ".monitoria"),
  ].filter((value): value is string => Boolean(value));
}

/**
 * Fecha as permissões do diretório em Linux e macOS.
 *
 * 0700 no diretório e 0600 nos arquivos: apenas o usuário do serviço lê a
 * entropia e o endpoint do canal local. É o equivalente POSIX da ACL que o
 * icacls aplica no Windows.
 */
async function restrictPosix(target: string) {
  try {
    await chmod(target, 0o700);
    const mode = (await stat(target)).mode & 0o777;
    return mode === 0o700;
  } catch {
    return false;
  }
}

async function runIcacls(target: string) {
  return new Promise<boolean>((resolve) => {
    if (process.platform !== "win32") {
      resolve(false);
      return;
    }

    const child = spawn(
      "icacls.exe",
      [
        target,
        "/inheritance:r",
        "/grant:r",
        `${SID_LOCAL_SYSTEM}:(OI)(CI)F`,
        "/grant:r",
        `${SID_ADMINISTRATORS}:(OI)(CI)F`,
      ],
      { stdio: ["ignore", "ignore", "ignore"], windowsHide: true },
    );

    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 15_000);

    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

async function usableDirectory(candidate: string) {
  await mkdir(candidate, { recursive: true });
  await access(candidate, constants.R_OK | constants.W_OK);
  return candidate;
}

/**
 * Cria a árvore de diretórios e tenta fechar a ACL. Falha de ACL não
 * interrompe a execução — apenas marca `restricted: false`, para o comando
 * `diagnose` conseguir apontar o problema em vez de o Agent morrer no boot.
 */
export async function resolvePaths(): Promise<PathLayout> {
  if (cached) return cached;

  let root: string | null = null;
  let lastError: unknown;

  for (const candidate of candidateRoots()) {
    try {
      root = await usableDirectory(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!root) {
    throw new Error(
      `Não foi possível criar a pasta de dados do Agent: ${
        lastError instanceof Error ? lastError.message : "erro desconhecido"
      }`,
    );
  }

  const restricted =
    process.platform === "win32" ? await runIcacls(root) : await restrictPosix(root);

  const layout: PathLayout = {
    root,
    configFile: path.join(root, "agent.json"),
    entropyFile: path.join(root, "machine.key"),
    ipcEndpointFile: path.join(root, "ipc.json"),
    queueDirectory: path.join(root, "queue"),
    logDirectory: path.join(root, "logs"),
    frameDirectory: path.join(root, "frames"),
    restricted,
  };

  await Promise.all([
    mkdir(layout.queueDirectory, { recursive: true }),
    mkdir(layout.logDirectory, { recursive: true }),
    mkdir(layout.frameDirectory, { recursive: true }),
  ]);

  cached = layout;
  return layout;
}

/** Descarta o cache. Usado apenas pelo `reset`. */
export function forgetPaths() {
  cached = null;
}

/**
 * Escrita atômica: grava em arquivo temporário e renomeia.
 *
 * O `rename` no mesmo volume é atômico no NTFS, então uma queda de energia
 * no meio da gravação deixa o arquivo anterior intacto em vez de deixar a
 * pasta sem configuração nenhuma.
 */
export async function writeFileAtomic(target: string, contents: string | Buffer) {
  const temporary = `${target}.${process.pid}.tmp`;

  try {
    await writeFile(temporary, contents, { mode: 0o600 });
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Entropia adicional do DPAPI, em base64.
 *
 * O escopo LocalMachine sozinho permite que qualquer processo da máquina
 * decifre o segredo. Somando esta entropia — que vive em arquivo legível
 * apenas por SYSTEM e Administradores — um processo sem elevação passa a
 * precisar de duas coisas, não de uma.
 *
 * Este arquivo nunca pode ser apagado sozinho: sem a entropia, o token
 * pareado se torna irrecuperável e a loja precisa parear de novo.
 */
export async function machineEntropy() {
  const layout = await resolvePaths();

  try {
    const existing = (await readFile(layout.entropyFile, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";

    if (code !== "ENOENT") throw error;
  }

  const generated = randomBytes(32).toString("base64");
  await writeFileAtomic(layout.entropyFile, `${generated}\n`);
  return generated;
}
