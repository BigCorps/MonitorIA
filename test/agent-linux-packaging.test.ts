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

  assert.match(workflow, /d27ef4e034b31e0ddfeebf16af54742d50455139e57517da15207113665a78f8/);
  assert.match(workflow, /c8c1cf0be6ca8f3b913b2733aa817743d9ea8211e36ef81075129f112d72f062/);
  assert.match(workflow, /systemd-analyze verify/);
  assert.match(workflow, /install\.sh" --uninstall/);
  assert.match(workflow, /Teste Linux completo aprovado/);
});
