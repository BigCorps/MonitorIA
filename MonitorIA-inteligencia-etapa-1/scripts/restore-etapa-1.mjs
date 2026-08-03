import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const repoIndex = args.indexOf("--repo");
const backupIndex = args.indexOf("--backup");
const repoArg = repoIndex >= 0 ? args[repoIndex + 1] : process.cwd();
const backupArg = backupIndex >= 0 ? args[backupIndex + 1] : null;

if (!backupArg || !repoArg) {
  throw new Error(
    "Use node restore-etapa-1.mjs --repo CAMINHO --backup CAMINHO_DO_BACKUP",
  );
}

const repoRoot = resolve(repoArg);
const backupRoot = resolve(backupArg);
const manifest = JSON.parse(
  await readFile(resolve(backupRoot, "manifest.json"), "utf8"),
);

if (manifest.version !== "visual-state-v1") {
  throw new Error("O diretório informado não é um backup da Etapa 1.");
}

for (const operation of [...manifest.operations].reverse()) {
  const targetPath = resolve(repoRoot, operation.path);

  if (operation.existedBefore) {
    const original = await readFile(
      resolve(backupRoot, operation.path),
      "utf8",
    );
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, original, "utf8");
    console.log(`Restaurado: ${operation.path}`);
  } else {
    await rm(targetPath, { force: true });
    console.log(`Removido: ${operation.path}`);
  }
}

console.log("Código restaurado. O rollback do banco deve ser executado separadamente.");
