import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pacote Linux inclui libs compartilhadas do FFmpeg", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/build-agent-linux.yml", import.meta.url),
    "utf8",
  );
  const installer = await readFile(
    new URL("../packaging/linux/install.sh", import.meta.url),
    "utf8",
  );
  const unit = await readFile(
    new URL("../packaging/linux/monitoria-agent.service", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /cp -a ffmpeg-tmp\/lib\/\. "\$OUT\/lib\/"/);
  assert.match(installer, /cp -a "\$\{SOURCE_DIR\}\/lib\/\." "\$\{PREFIX\}\/ffmpeg\/lib\/"/);
  assert.match(unit, /LD_LIBRARY_PATH=\/opt\/monitoria\/ffmpeg\/lib/);
});
