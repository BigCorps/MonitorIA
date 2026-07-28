import { spawn } from "node:child_process";

function encodedPowerShell(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

async function runPowerShell(script: string, stdinValue: string) {
  if (process.platform !== "win32") {
    throw new Error("A proteção DPAPI desta versão funciona somente no Windows.");
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encodedPowerShell(script),
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Falha ao acessar o DPAPI do Windows: ${stderr.trim() || `código ${code}`}`,
          ),
        );
        return;
      }

      resolve(stdout.trim());
    });

    child.stdin.end(stdinValue, "utf8");
  });
}

const PROTECT_SCRIPT = `
$plain = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($plain)
$protected = [System.Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([Convert]::ToBase64String($protected))
`;

const UNPROTECT_SCRIPT = `
$encoded = [Console]::In.ReadToEnd().Trim()
$protected = [Convert]::FromBase64String($encoded)
$bytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protected,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Console]::Out.Write([System.Text.Encoding]::UTF8.GetString($bytes))
`;

export async function protectSecret(value: string) {
  if (!value) throw new Error("Não é possível proteger um segredo vazio.");
  return runPowerShell(PROTECT_SCRIPT, value);
}

export async function unprotectSecret(value: string) {
  if (!value) throw new Error("Segredo protegido ausente.");
  return runPowerShell(UNPROTECT_SCRIPT, value);
}
