import {
  access,
  copyFile,
  mkdir,
  readdir,
  rm,
} from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const source = resolve(
  process.cwd(),
  "node_modules",
  "@ffmpeg",
  "ffmpeg",
  "dist",
  "esm",
);

const destination = resolve(
  process.cwd(),
  "public",
  "vendor",
  "ffmpeg",
);

try {
  await access(source);
} catch {
  throw new Error(
    "Não encontrei node_modules/@ffmpeg/ffmpeg/dist/esm. Rode npm install antes do build.",
  );
}

const runtimeExtensions = new Set([
  ".js",
  ".mjs",
  ".wasm",
  ".map",
]);

async function copyRuntimeFiles(from, to) {
  await mkdir(to, { recursive: true });

  const entries = await readdir(from, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const sourcePath = join(from, entry.name);
    const targetPath = join(to, entry.name);

    if (entry.isDirectory()) {
      await copyRuntimeFiles(sourcePath, targetPath);
      continue;
    }

    if (!runtimeExtensions.has(extname(entry.name))) {
      continue;
    }

    await copyFile(sourcePath, targetPath);
  }
}

await rm(destination, {
  recursive: true,
  force: true,
});

await copyRuntimeFiles(source, destination);

console.log(
  "[vendor-ffmpeg] runtime ESM copiado sem declarações TypeScript",
);
