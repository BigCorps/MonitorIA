import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const backupIndex = args.indexOf("--backup");
const backupRoot = backupIndex >= 0 ? resolve(args[backupIndex + 1]) : null;

if (!backupRoot) {
  throw new Error("Use --backup CAMINHO_DO_BACKUP.");
}

const manifest = JSON.parse(
  await readFile(resolve(backupRoot, "manifest.json"), "utf8"),
);

if (manifest.version !== "short-memory-v1") {
  throw new Error("O diretório informado não é um backup da Etapa 2.");
}

for (const operation of manifest.operations) {
  const target = resolve(manifest.repoRoot, operation.path);
  if (operation.existedBefore) {
    const source = resolve(backupRoot, operation.path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
    console.log(`Restaurado: ${operation.path}`);
  } else {
    await rm(target, { force: true });
    console.log(`Removido: ${operation.path}`);
  }
}

console.log("Código restaurado. O rollback do banco é um SQL separado.");
