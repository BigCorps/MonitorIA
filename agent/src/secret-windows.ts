import { spawn } from "node:child_process";
import path from "node:path";
import { machineEntropy } from "./paths.js";

/**
 * Backend Windows do cofre: DPAPI nativo.
 *
 * O processo auxiliar é compilado do fonte C versionado em agent/native e
 * chama CryptProtectData/CryptUnprotectData diretamente. Assim o Agent não
 * depende de shell, terminal nem política de execução da máquina do cliente.
 * Os dados seguem por stdin; segredo algum aparece em argumento de processo.
 *
 * Formato persistido:
 *   "v2:<base64>"  LocalMachine + entropia (atual)
 *   "<base64>"     CurrentUser sem entropia (legado, apenas leitura)
 */

const PREFIX_V2 = "v2:";
const DPAPI_TIMEOUT_MS = 15_000;

type Operation = "protect" | "unprotect";

function helperPath() {
  return path.join(
    path.dirname(process.execPath),
    "monitoria-dpapi.exe",
  );
}

function runDpapi(
  operation: Operation,
  payload: string,
  entropy: string,
) {
  return new Promise<string>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("A proteção DPAPI só está disponível no Windows."));
      return;
    }

    const child = spawn(helperPath(), [operation], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let settled = false;

    const finish = (error: Error | null, value = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("Tempo esgotado ao acessar o cofre do Windows."));
    }, DPAPI_TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    // A saída de erro nativa nunca é propagada: em criptografia, mensagens
    // de baixo nível não devem correr o risco de repetir conteúdo sensível.
    child.stderr.resume();

    child.on("error", () => {
      finish(
        new Error(
          "O componente de segurança do MonitorIA não foi encontrado. Reinstale o aplicativo.",
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        finish(null, stdout.trim());
        return;
      }

      finish(
        new Error(
          operation === "unprotect"
            ? "O dado protegido não pertence a esta máquina ou a entropia mudou."
            : "O Windows não conseguiu proteger a configuração do MonitorIA.",
        ),
      );
    });

    child.stdin.on("error", () => {
      finish(
        new Error(
          "Não foi possível enviar os dados ao cofre do Windows.",
        ),
      );
    });

    child.stdin.end(`${payload}\n${entropy}\n`, "utf8");
  });
}

export async function protectWindows(plain: string) {
  const entropy = await machineEntropy();
  const payload = Buffer.from(plain, "utf8").toString("base64");
  const result = await runDpapi("protect", payload, entropy);
  return `${PREFIX_V2}${result}`;
}

export type WindowsRevealResult = {
  value: string;
  legacy: boolean;
};

export async function revealWindows(
  stored: string,
): Promise<WindowsRevealResult> {
  const trimmed = stored.trim();

  if (trimmed.startsWith(PREFIX_V2)) {
    const entropy = await machineEntropy();
    const output = await runDpapi(
      "unprotect",
      trimmed.slice(PREFIX_V2.length),
      entropy,
    );

    return {
      value: Buffer.from(output, "base64").toString("utf8"),
      legacy: false,
    };
  }

  const output = await runDpapi("unprotect", trimmed, "");
  return {
    value: Buffer.from(output, "base64").toString("utf8"),
    legacy: true,
  };
}
