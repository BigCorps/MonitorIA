import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const backupIndex = args.indexOf("--backup");
const backupArg = backupIndex >= 0 ? args[backupIndex + 1] : null;

if (!backupArg || backupArg.startsWith("--")) {
  throw new Error("Use --backup CAMINHO para indicar o backup da Fase 3.");
}

const backupRoot = resolve(backupArg);
const manifest = JSON.parse(
  await readFile(resolve(backupRoot, "manifest.json"), "utf8"),
);
const repoRoot = resolve(manifest.repoRoot);

for (const operation of manifest.operations) {
  const destination = resolve(repoRoot, operation.path);

  if (!operation.existedBefore) {
    await rm(destination, { force: true });
    continue;
  }

  const source = resolve(backupRoot, operation.path);
  const content = await readFile(source, "utf8");
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, content, "utf8");
}

console.log(`Código restaurado a partir de ${backupRoot}.`);
