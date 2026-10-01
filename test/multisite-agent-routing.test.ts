import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pareamento permite escolher local existente ou criar outro local", async () => {
  const [actions, page, flow] = await Promise.all([
    readFile(
      new URL(
        "../app/dashboard/installer/pair/actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/installer/pair/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/installer/pair/repair-connection-flow.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(actions, /formData\.get\("site_id"\)/);
  assert.match(actions, /requestedSiteId !== "__new__"/);
  assert.match(actions, /\.from\("sites"\)\s*\.insert/s);
  assert.match(actions, /getRepairPairingStatusAction\(\s*siteId:/);
  assert.match(page, /Um Agent ativo por local/);
  assert.match(flow, /\+ Criar novo local/);
  assert.match(flow, /Agents de outros locais permanecem intactos/);
});

test("descoberta é enviada ao Agent explicitamente selecionado", async () => {
  const [actions, page, panel, repairPanel] = await Promise.all([
    readFile(
      new URL(
        "../app/dashboard/cameras/discovery/actions.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/cameras/discovery/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/cameras/discovery/discovery-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/dashboard/installer/pair/repair-discovery-panel.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(actions, /formData\.get\("agent_id"\)/);
  assert.match(actions, /\.eq\("id", requestedAgentId\)/);
  assert.match(actions, /\.eq\("status", "online"\)/);
  assert.match(page, /site:sites\(id,name\)/);
  assert.match(panel, /Local \/ computador/);
  assert.match(panel, /name="agent_id"/);
  assert.match(repairPanel, /name="agent_id"/);
  assert.match(repairPanel, /value=\{agentId\}/);
});

test("deduplicação visual só atua no fallback sem sourceToken ONVIF", async () => {
  const discovery = await readFile(
    new URL(
      "../agent/src/discovery/index.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(discovery, /MAX_CONSECUTIVE_VISUAL_ALIASES/);
  assert.match(discovery, /duplicateChannelFor/);
  assert.match(discovery, /sourceKey !== null/);
  assert.match(discovery, /mesma imagem do canal/);
  assert.match(discovery, /aliases de canal/);
});
