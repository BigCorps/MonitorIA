import { spawn } from "node:child_process";
import { machineEntropy } from "./paths.js";

/**
 * Backend Windows do cofre: DPAPI.
 *
 * Não é chamado diretamente. O despacho por plataforma fica em
 * secret-store.ts; este arquivo só sabe falar DPAPI.
 *
 * Mudança em relação à versão anterior do Agent: o escopo passou de
 * CurrentUser para LocalMachine, somado a uma entropia guardada em arquivo
 * com ACL restrita.
 *
 * O motivo é o serviço. Com CurrentUser, o segredo é cifrado com o perfil de
 * quem executou o pareamento e o serviço rodando como LocalSystem não
 * consegue decifrar — o Agent subiria sem token e ficaria em loop de 401.
 *
 * Formato de saída:
 *   "v2:<base64>"  LocalMachine + entropia   (atual)
 *   "<base64>"     CurrentUser sem entropia  (legado, apenas leitura)
 *
 * A leitura aceita os dois. Quem gravou no formato legado é migrado na
 * primeira leitura bem-sucedida, por `SecretVault`.
 */

const PREFIX_V2 = "v2:";
const POWERSHELL_TIMEOUT_MS = 20_000;

type Scope = "LocalMachine" | "CurrentUser";
type Operation = "Protect" | "Unprotect";

function buildScript(operation: Operation, scope: Scope) {
  // O script recebe duas linhas em stdin: payload base64 e entropia base64.
  // A entropia pode vir vazia, para o formato legado.
  return [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Security",
    "$raw = [Console]::In.ReadToEnd()",
    "$lines = $raw -split \"`r?`n\"",
    "$payload = [Convert]::FromBase64String($lines[0].Trim())",
    "$entropy = $null",
    "if ($lines.Length -gt 1) {",
    "  $candidate = $lines[1].Trim()",
    "  if ($candidate.Length -gt 0) { $entropy = [Convert]::FromBase64String($candidate) }",
    "}",
    `$scope = [System.Security.Cryptography.DataProtectionScope]::${scope}`,
    `$result = [System.Security.Cryptography.ProtectedData]::${operation}($payload, $entropy, $scope)`,
    "[Console]::Out.Write([Convert]::ToBase64String($result))",
  ].join("\n");
}

/**
 * O script vai por -EncodedCommand e os dados por stdin.
 *
 * Passar o script por -Command deixaria stdin ocupado pelo próprio script,
 * e passar por argumento exigiria escapar aspas de conteúdo binário — as
 * duas rotas quebram com senha de RTSP contendo caractere especial.
 */
function runPowerShell(script: string, stdinPayload: string) {
  return new Promise<string>((resolve, reject) => {
    if (process.platform !== "win32") {
      reject(new Error("A proteção DPAPI só está disponível no Windows."));
      return;
    }

    const encoded = Buffer.from(script, "utf16le").toString("base64");

    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
      { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Tempo esgotado ao acessar o DPAPI do Windows."));
    }, POWERSHELL_TIMEOUT_MS);

    const finish = (error: Error | null, value?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value ?? "");
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      finish(
        new Error(
          `Não foi possível executar o PowerShell: ${error.message}. ` +
            "Verifique se ele não está bloqueado por política de grupo.",
        ),
      );
    });

    child.on("close", (code) => {
      if (code === 0) {
        finish(null, stdout.trim());
        return;
      }

      // A mensagem do PowerShell pode conter o texto claro em cenários de
      // erro, então nunca é repassada adiante.
      const hint = stderr.includes("Unprotect")
        ? "O dado protegido não pertence a esta máquina ou a entropia mudou."
        : "Falha na operação de criptografia.";

      finish(new Error(hint));
    });

    child.stdin.end(stdinPayload, "utf8");
  });
}

/** Cifra um segredo no formato atual. */
export async function protectWindows(plain: string) {
  const entropy = await machineEntropy();
  const payload = Buffer.from(plain, "utf8").toString("base64");
  const script = buildScript("Protect", "LocalMachine");
  const result = await runPowerShell(script, `${payload}\n${entropy}`);

  return `${PREFIX_V2}${result}`;
}

export type WindowsRevealResult = {
  value: string;
  /** true quando o dado veio no formato antigo e precisa ser regravado. */
  legacy: boolean;
};

/** Decifra aceitando o formato atual e o legado. */
export async function revealWindows(stored: string): Promise<WindowsRevealResult> {
  const trimmed = stored.trim();

  if (trimmed.startsWith(PREFIX_V2)) {
    const entropy = await machineEntropy();
    const script = buildScript("Unprotect", "LocalMachine");
    const output = await runPowerShell(
      script,
      `${trimmed.slice(PREFIX_V2.length)}\n${entropy}`,
    );

    return { value: Buffer.from(output, "base64").toString("utf8"), legacy: false };
  }

  // Formato legado: CurrentUser, sem entropia. Só decifra se o serviço
  // estiver rodando sob o mesmo perfil que pareou — por isso a migração
  // precisa acontecer antes de converter o Agent em serviço.
  const script = buildScript("Unprotect", "CurrentUser");
  const output = await runPowerShell(script, `${trimmed}\n`);

  return { value: Buffer.from(output, "base64").toString("utf8"), legacy: true };
}
