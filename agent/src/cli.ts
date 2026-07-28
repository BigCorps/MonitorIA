import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptText(label: string, defaultValue?: string) {
  const interfaceInstance = readline.createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await interfaceInstance.question(`${label}${suffix}: `)).trim();
    return answer || defaultValue || "";
  } finally {
    interfaceInstance.close();
  }
}

export async function promptSecret(label: string) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return promptText(label);
  }

  stdout.write(`${label}: `);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise<string>((resolve, reject) => {
    let value = "";

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");

      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Operação cancelada."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
          continue;
        }

        if (character >= " ") {
          value += character;
          stdout.write("*");
        }
      }
    };

    stdin.on("data", onData);
  });
}

export function closePrompt() {
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    try {
      stdin.setRawMode(false);
    } catch {
      // O terminal pode já estar fechado.
    }
  }
}
