import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import os from "node:os";
import path from "node:path";

/**
 * Estado do MonitorIA por host.
 *
 * Windows 24/7 / Service Host:
 *   %PROGRAMDATA%\MonitorIA
 *   ACL fechada para SYSTEM + Administradores.
 *
 * Windows Desktop / Microsoft Store:
 *   %LOCALAPPDATA%\MonitorIA
 *   ACL herdada do perfil do usuário. O Desktop Host define explicitamente
 *   MONITORIA_DESKTOP_MODE=1 e MONITORIA_CONFIG_DIR antes de iniciar o Core.
 *
 * Linux:
 *   /var/lib/monitoria
 *
 * A diferença é somente de host/escopo de dados; fila, câmeras, timeline,
 * eventos e evidências continuam no mesmo Core 1.0.3.
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
  /**
   * true quando a proteção de diretório adequada ao host foi preservada,
   * false quando falhou, e null quando nem foi tentada.
   */
  restricted: boolean | null;
};

let cached: PathLayout | null = null;

/**
 * O processo longo do Core gerencia a proteção da pasta.
 *
 * No Service Host isso aplica icacls.
 * No Desktop Host não se remove a ACL herdada do perfil do usuário.
 */
let manageAcl = false;

export function enableAclManagement() {
  manageAcl = true;
}

export function isWindowsDesktopHost() {
  return (
    process.platform === "win32" &&
    process.env.MONITORIA_DESKTOP_MODE?.trim() === "1"
  );
}

function candidateRoots() {
  const overridden =
    process.env.MONITORIA_CONFIG_DIR?.trim();
  const programData =
    process.env.PROGRAMDATA?.trim();
  const localAppData =
    process.env.LOCALAPPDATA?.trim();

  if (process.platform !== "win32") {
    return [
      overridden || undefined,
      "/var/lib/monitoria",
      path.join(
        os.homedir(),
        ".local",
        "share",
        "monitoria",
      ),
      path.join(
        process.cwd(),
        ".monitoria",
      ),
    ].filter(
      (value): value is string =>
        Boolean(value),
    );
  }

  if (isWindowsDesktopHost()) {
    return [
      overridden || undefined,
      localAppData
        ? path.join(
            localAppData,
            "MonitorIA",
          )
        : undefined,
      path.join(
        os.homedir(),
        "AppData",
        "Local",
        "MonitorIA",
      ),
    ].filter(
      (value): value is string =>
        Boolean(value),
    );
  }

  return [
    overridden || undefined,
    programData
      ? path.join(
          programData,
          "MonitorIA",
        )
      : undefined,
    path.join(
      process.cwd(),
      ".monitoria",
    ),
  ].filter(
    (value): value is string =>
      Boolean(value),
  );
}

/**
 * Fecha as permissões do diretório em Linux/macOS.
 */
async function restrictPosix(
  target: string,
) {
  try {
    await chmod(target, 0o700);
    const mode =
      (await stat(target)).mode &
      0o777;
    return mode === 0o700;
  } catch {
    return false;
  }
}

/**
 * Service Host: só SYSTEM e Administradores.
 *
 * Nunca executar no Desktop Host: remover a ACL herdada de LOCALAPPDATA
 * expulsaria justamente o usuário que precisa continuar executando o Core.
 */
async function runIcacls(
  target: string,
) {
  return new Promise<boolean>(
    (resolve) => {
      if (
        process.platform !== "win32"
      ) {
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
        {
          stdio: [
            "ignore",
            "ignore",
            "ignore",
          ],
          windowsHide: true,
        },
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
    },
  );
}

function errorCode(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "code" in error
      ? String(
          (
            error as {
              code?: unknown;
            }
          ).code,
        )
      : ""
  );
}

async function usableDirectory(
  candidate: string,
) {
  try {
    await access(
      candidate,
      constants.R_OK |
        constants.W_OK,
    );
    return candidate;
  } catch (error) {
    const code = errorCode(error);

    if (
      code === "EACCES" ||
      code === "EPERM"
    ) {
      throw new PermissionError(
        candidate,
      );
    }
  }

  try {
    await mkdir(candidate, {
      recursive: true,
    });
    await access(
      candidate,
      constants.R_OK |
        constants.W_OK,
    );
    return candidate;
  } catch (error) {
    const code = errorCode(error);

    if (
      code === "EACCES" ||
      code === "EPERM" ||
      code === "EEXIST"
    ) {
      throw new PermissionError(
        candidate,
      );
    }

    throw error;
  }
}

export class PermissionError extends Error {
  constructor(
    readonly directory: string,
  ) {
    super(
      isWindowsDesktopHost()
        ? `Sem permissão para acessar ${directory}. Feche o MonitorIA e abra o aplicativo novamente.`
        : `Sem permissão para acessar ${directory}. Execute novamente o instalador do MonitorIA e confirme a solicitação de administrador do Windows.`,
    );
    this.name = "PermissionError";
  }
}

/**
 * Cria a árvore de diretórios e aplica a proteção apropriada ao host.
 */
export async function resolvePaths():
Promise<PathLayout> {
  if (cached) return cached;

  let root: string | null = null;
  let lastError: unknown;

  for (
    const candidate of candidateRoots()
  ) {
    try {
      root =
        await usableDirectory(
          candidate,
        );
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!root) {
    if (
      lastError instanceof
      PermissionError
    ) {
      throw lastError;
    }

    throw new Error(
      `Não foi possível criar a pasta de dados do Agent: ${
        lastError instanceof Error
          ? lastError.message
          : "erro desconhecido"
      }`,
    );
  }

  const restricted = !manageAcl
    ? null
    : process.platform === "win32"
      ? isWindowsDesktopHost()
        // LOCALAPPDATA já nasce dentro da ACL do perfil do usuário.
        // Não removemos herança e não concedemos acesso a outros usuários.
        ? true
        : await runIcacls(root)
      : await restrictPosix(root);

  const layout: PathLayout = {
    root,
    configFile: path.join(
      root,
      "agent.json",
    ),
    entropyFile: path.join(
      root,
      "machine.key",
    ),
    ipcEndpointFile: path.join(
      root,
      "ipc.json",
    ),
    queueDirectory: path.join(
      root,
      "queue",
    ),
    logDirectory: path.join(
      root,
      "logs",
    ),
    frameDirectory: path.join(
      root,
      "frames",
    ),
    restricted,
  };

  await Promise.all([
    mkdir(layout.queueDirectory, {
      recursive: true,
    }),
    mkdir(layout.logDirectory, {
      recursive: true,
    }),
    mkdir(layout.frameDirectory, {
      recursive: true,
    }),
  ]);

  cached = layout;
  return layout;
}

/** Descarta o cache. Usado apenas pelo reset. */
export function forgetPaths() {
  cached = null;
}

/**
 * Escrita atômica.
 */
export async function writeFileAtomic(
  target: string,
  contents: string | Buffer,
) {
  const temporary =
    `${target}.${process.pid}.tmp`;

  try {
    await writeFile(
      temporary,
      contents,
      { mode: 0o600 },
    );
    await rename(
      temporary,
      target,
    );
  } catch (error) {
    await rm(
      temporary,
      { force: true },
    );
    throw error;
  }
}

/**
 * Entropia adicional do cofre Windows.
 *
 * Service Host: arquivo protegido pela ACL SYSTEM/Admin.
 * Desktop Host: arquivo protegido pela ACL do perfil em LOCALAPPDATA.
 *
 * O DPAPI continua LocalMachine + entropia, preservando um único formato de
 * segredo entre as duas distribuições Windows.
 */
export async function machineEntropy() {
  const layout =
    await resolvePaths();

  try {
    const existing = (
      await readFile(
        layout.entropyFile,
        "utf8",
      )
    ).trim();

    if (existing.length >= 32) {
      return existing;
    }
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error
        ? String(
            (
              error as {
                code?: unknown;
              }
            ).code,
          )
        : "";

    if (code !== "ENOENT") {
      throw error;
    }
  }

  const generated =
    randomBytes(32).toString(
      "base64",
    );

  await writeFileAtomic(
    layout.entropyFile,
    `${generated}\n`,
  );

  return generated;
}
