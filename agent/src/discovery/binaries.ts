import { access, constants } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * Localização do FFmpeg e do FFprobe empacotados.
 *
 * O instalador coloca os dois em {app}\ffmpeg\, ao lado do executável do
 * Agent. A resolução anterior procurava apenas no PATH e no diretório do
 * winget — nenhum dos dois encontra o binário embutido, e o serviço subiria
 * reclamando de FFmpeg ausente com o arquivo ali do lado.
 */

export async function bundledBinary(name: "ffmpeg" | "ffprobe") {
  const executable = process.platform === "win32" ? `${name}.exe` : name;

  const candidates = [
    path.join(path.dirname(process.execPath), "ffmpeg", executable),
    path.join(process.cwd(), "ffmpeg", executable),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Tenta o próximo.
    }
  }

  return null;
}

function probeVersion(command: string, expected: string) {
  return new Promise<boolean>((resolve) => {
    const child = spawn(command, ["-version"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 8_000);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && output.toLowerCase().includes(expected));
    });
  });
}

export async function resolveFfprobe() {
  const configured = process.env.MONITORIA_FFPROBE_PATH?.trim();
  const bundled = await bundledBinary("ffprobe");

  const candidates = [configured, bundled, "ffprobe"].filter(
    (value): value is string => Boolean(value),
  );

  for (const candidate of candidates) {
    if (await probeVersion(candidate, "ffprobe version")) return candidate;
  }

  throw new Error(
    "FFprobe não encontrado. Reinstale o MonitorIA para restaurar os componentes de vídeo.",
  );
}
