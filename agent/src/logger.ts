import { appendFile, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePaths } from "./paths.js";

/**
 * Log do Agent.
 *
 * A versão anterior escrevia tudo em console.log. Num serviço do Windows não
 * existe console: a saída ia para lugar nenhum e o suporte remoto ficava
 * cego. Aqui o log vai para arquivo, com rotação por tamanho e teto de disco.
 *
 * O teto importa mais do que parece. O Supabase já tem a restrição de disco
 * que não encolhe; a máquina da loja tem o problema equivalente e ninguém
 * para monitorar. Um serviço que roda 24h por dia por dois anos e nunca
 * apaga log acaba enchendo o disco do cliente.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 5;
const FILE_NAME = "agent.log";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  /** Assinatura compatível com o startIpcServer. */
  log: (level: "info" | "warn" | "error", message: string) => void;
  flush: () => Promise<void>;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Remove credenciais antes de qualquer coisa chegar ao disco.
 *
 * URLs RTSP carregam usuário e senha embutidos. Um log com a senha da câmera
 * em claro seria pior que não ter log: o arquivo é lido por suporte, copiado
 * em ticket, anexado em e-mail.
 */
export function redact(message: string) {
  return message
    .replace(/(rtsp|rtsps|http|https):\/\/[^\s/@]+:[^\s/@]+@/gi, "$1://***:***@")
    .replace(/([?&](?:password|senha|token|key|secret)=)[^&\s]+/gi, "$1***")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, "$1***");
}

async function fileSize(target: string) {
  try {
    return (await stat(target)).size;
  } catch {
    return 0;
  }
}

/**
 * Rotação: agent.log vira agent.1.log, o 1 vira 2, e o mais antigo some.
 * Com 5 arquivos de 5 MB o teto fica em 25 MB, independente de há quanto
 * tempo o serviço está no ar.
 */
async function rotate(directory: string) {
  const current = path.join(directory, FILE_NAME);

  await rm(path.join(directory, `agent.${MAX_FILES}.log`), { force: true });

  for (let index = MAX_FILES - 1; index >= 1; index -= 1) {
    const from = path.join(directory, `agent.${index}.log`);
    const to = path.join(directory, `agent.${index + 1}.log`);

    try {
      await rename(from, to);
    } catch {
      // Arquivo inexistente é o caso normal nas primeiras rotações.
    }
  }

  try {
    await rename(current, path.join(directory, "agent.1.log"));
  } catch {
    // Se o arquivo atual sumiu, a próxima escrita o recria.
  }
}

/**
 * Nível mínimo, ajustável sem recompilar.
 *
 * Existe porque o detalhe técnico das falhas de câmera foi para `debug` e
 * simplesmente desapareceu: o padrão é `info`, e em campo o log passou a
 * mostrar só a mensagem amigável, sem a causa. Diagnosticar remotamente virou
 * impossível. Agora o suporte pede para definir MONITORIA_LOG_LEVEL=debug e
 * reiniciar o serviço.
 */
function levelFromEnv(): LogLevel | null {
  const raw = process.env.MONITORIA_LOG_LEVEL?.trim().toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") return raw;
  return null;
}

export async function createLogger(options?: {
  level?: LogLevel;
  /** true quando executado a partir de um terminal, não do serviço. */
  mirrorToConsole?: boolean;
}): Promise<Logger> {
  const layout = await resolvePaths();
  const directory = layout.logDirectory;
  const minimum = LEVEL_ORDER[levelFromEnv() ?? options?.level ?? "info"];
  const mirror = options?.mirrorToConsole ?? false;

  // As escritas são serializadas numa única cadeia de promessas. Sem isso,
  // duas mensagens simultâneas podem intercalar bytes no mesmo arquivo.
  let chain: Promise<void> = Promise.resolve();

  function write(level: LogLevel, message: string) {
    if (LEVEL_ORDER[level] < minimum) return;

    const safe = redact(message);
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${safe}\n`;

    if (mirror) {
      if (level === "error") console.error(line.trimEnd());
      else if (level === "warn") console.warn(line.trimEnd());
      else console.log(line.trimEnd());
    }

    chain = chain
      .then(async () => {
        const target = path.join(directory, FILE_NAME);

        if ((await fileSize(target)) + Buffer.byteLength(line) > MAX_FILE_BYTES) {
          await rotate(directory);
        }

        await appendFile(target, line, "utf8");
      })
      .catch(() => {
        // Falha ao gravar log nunca derruba o serviço. Se o disco encheu, o
        // comando diagnose reporta o espaço livre e o problema aparece lá.
      });
  }

  return {
    debug: (message) => write("debug", message),
    info: (message) => write("info", message),
    warn: (message) => write("warn", message),
    error: (message) => write("error", message),
    log: (level, message) => write(level, message),
    flush: () => chain,
  };
}

/** Espaço total ocupado pelos logs, para o diagnose. */
export async function logDiskUsage() {
  const layout = await resolvePaths();

  let total = 0;
  let files = 0;

  try {
    for (const entry of await readdir(layout.logDirectory)) {
      if (!entry.endsWith(".log")) continue;
      total += await fileSize(path.join(layout.logDirectory, entry));
      files += 1;
    }
  } catch {
    return { totalBytes: 0, files: 0 };
  }

  return { totalBytes: total, files };
}
