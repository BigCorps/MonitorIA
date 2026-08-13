import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerPath = new URL(
  "../installer/monitoria.iss",
  import.meta.url,
);

test("desinstalação remove serviço, processos e todo o estado local", async () => {
  const source = await readFile(installerPath, "utf8");

  assert.match(
    source,
    /Parameters:\s*"\/F \/T \/IM monitoria-agent\.exe"/,
  );

  assert.match(
    source,
    /Parameters:\s*"delete MonitorIAAgent"/,
  );

  assert.match(
    source,
    /Type:\s*filesandordirs;\s*Name:\s*"\{commonappdata\}\\MonitorIA"/,
  );

  assert.match(
    source,
    /Type:\s*filesandordirs;\s*Name:\s*"\{app\}"/,
  );

  assert.doesNotMatch(
    source,
    /machine\.key permanecem de propósito/,
  );

  assert.doesNotMatch(
    source,
    /agent\.json.*permanecem de propósito/,
  );
});
