import {
  cp,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

async function replaceIn(relative, before, after) {
  const target = path.join(root, relative);
  const current = await readFile(target, "utf8");

  if (!current.includes(before)) {
    if (current.includes(after)) {
      console.log(`${relative}: já atualizado`);
      return;
    }
    throw new Error(`Marcador não encontrado em ${relative}`);
  }

  await writeFile(target, current.replaceAll(before, after), "utf8");
  console.log(`${relative}: atualizado`);
}

await cp(
  path.join(here, "agent/src/clip-buffer.ts"),
  path.join(root, "agent/src/clip-buffer.ts"),
);

await replaceIn(
  "agent/src/service.ts",
  'export const AGENT_VERSION = "0.10.0";',
  'export const AGENT_VERSION = "0.10.1";',
);

await replaceIn(
  "agent/package.json",
  '"version": "0.10.0"',
  '"version": "0.10.1"',
);

await replaceIn(
  "agent/package.json",
  "--windows-version=0.10.0",
  "--windows-version=0.10.1",
);

await replaceIn(
  ".github/workflows/build-agent.yml",
  'AGENT_VERSION: "0.10.0"',
  'AGENT_VERSION: "0.10.1"',
);

await replaceIn(
  ".github/workflows/build-agent-linux.yml",
  'AGENT_VERSION: "0.10.0"',
  'AGENT_VERSION: "0.10.1"',
);

console.log("");
console.log("MonitorIA Agent 0.10.1 preparado.");
console.log("Rode:");
console.log("  npx tsc --noEmit -p agent/tsconfig.json");
console.log("  git diff");
