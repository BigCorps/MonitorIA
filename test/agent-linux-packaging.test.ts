import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desinstalacao Linux remove estado e usuario dedicado", async () => {
  const installer = await readFile(
    new URL("../packaging/linux/install.sh", import.meta.url),
    "utf8",
  );

  assert.match(installer, /rm -rf "\$STATE_DIR"/);
  assert.match(installer, /userdel "\$SERVICE_USER"/);
  assert.match(installer, /Uma nova instalação exigirá novo pareamento/);
  assert.doesNotMatch(installer, /pareamento.*preservado/i);
});

test("workflow Linux fixa hashes e testa instalacao real", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/build-agent-linux.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /e9144cae41096aba50d7c6caba0d15822ad04f9f3a97f394cecd7bb93eae68b8/);
  assert.match(workflow, /9279602b39d14c0446209b3b70f42b497d3edf8b252c926d3f342902d9357d02/);
  assert.match(workflow, /systemd-analyze verify/);
  assert.match(workflow, /install\.sh" --uninstall/);
  assert.match(workflow, /Teste Linux completo aprovado/);
});
