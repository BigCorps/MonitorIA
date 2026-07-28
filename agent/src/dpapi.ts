import { spawn } from "node:child_process";

function encodedPowerShell(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function normalizePowerShellError(value: string) {
  return value
    .replace(/^#< CLIXML\s*/i, "")
    .replace(/_x000D__x000A_/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
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
        "-InputFormat",
        "Text",
        "-OutputFormat",
        "Text",
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
      const result = stdout.trim();

      if (code !== 0) {
        const detail =
          normalizePowerShellError(stderr) ||
          normalizePowerShellError(stdout) ||
          `código ${code}`;

        reject(new Error(`Falha ao acessar o DPAPI do Windows: ${detail}`));
        return;
      }

      if (!result) {
        reject(
          new Error(
            "Falha ao acessar o DPAPI do Windows: o PowerShell não retornou dados.",
          ),
        );
        return;
      }

      resolve(result);
    });

    child.stdin.end(stdinValue, "ascii");
  });
}

const COMMON_PREAMBLE = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

try {
  Add-Type -AssemblyName System.Security -ErrorAction Stop
}
catch {
  try {
    Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop
  }
  catch {
    throw "Não foi possível carregar a biblioteca de proteção de dados do Windows."
  }
}
`;

const PROTECT_SCRIPT = `
${COMMON_PREAMBLE}

try {
  $plainBase64 = [Console]::In.ReadToEnd().Trim()
  $plainBytes = [Convert]::FromBase64String($plainBase64)

  $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
    $plainBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )

  [Console]::Out.Write([Convert]::ToBase64String($protectedBytes))
}
catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
`;

const UNPROTECT_SCRIPT = `
${COMMON_PREAMBLE}

try {
  $protectedBase64 = [Console]::In.ReadToEnd().Trim()
  $protectedBytes = [Convert]::FromBase64String($protectedBase64)

  $plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
    $protectedBytes,
    $null,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )

  [Console]::Out.Write([Convert]::ToBase64String($plainBytes))
}
catch {
  [Console]::Error.Write($_.Exception.Message)
  exit 1
}
`;

export async function protectSecret(value: string) {
  if (!value) {
    throw new Error("Não é possível proteger um segredo vazio.");
  }

  const plainBase64 = Buffer.from(value, "utf8").toString("base64");
  return runPowerShell(PROTECT_SCRIPT, plainBase64);
}

export async function unprotectSecret(value: string) {
  if (!value) {
    throw new Error("Segredo protegido ausente.");
  }

  const plainBase64 = await runPowerShell(UNPROTECT_SCRIPT, value);

  try {
    return Buffer.from(plainBase64, "base64").toString("utf8");
  } catch {
    throw new Error("O DPAPI retornou um segredo em formato inválido.");
  }
}
