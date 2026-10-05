import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const canonical = [
  "AGENTS.md",
  "README-CONTINUIDADE.md",
  "README.md",
  "CHANGELOG.md",
  "docs/PRODUCT-CONTRACT.md",
  "docs/releases/MONITORIA-1.0.3-CONTRACT.md",
];

const retired = [
  "PLANO-DE-PRODUCAO.md",
  "PROJETO-MONITORIA.md",
  "PASSAGEM-DE-BASTAO.md",
  "MANIFEST.json",
  "manifest.json",
  "VALIDACAO-VIP-GATE-1.md",
  "docs/MONITORIA-VIP-GATE-1.md",
  "docs/MONITORIA-1.0.3-ENTREGA-05A.md",
  "docs/MONITORIA-1.0.3-MATRIZ-RC.md",
  "app/dashboard/admin/admin-shell.tsx.before-video-lab",
];

test("repositório possui uma hierarquia canônica curta", () => {
  for (const path of canonical) {
    assert.equal(existsSync(path), true, `${path} precisa existir`);
  }

  for (const path of retired) {
    assert.equal(existsSync(path), false, `${path} não deve voltar ao main`);
  }
});

test("raiz não volta a acumular artefatos de aplicação ou workflows duplicados", () => {
  const retiredRoot = [
    "ANALYTICS-GTM-SETUP.md",
    "APLICAR-MEETING-RTMP-INFANCIA.md",
    "APLICAR-STORE.md",
    "CHECKLIST-REENVIO-OPENAI.md",
    "LEIA-ME - AGENT WINDOWS.md",
    "OPENAI-ADS-CAMPAIGN-DRAFT.md",
    "OPENAI-ADS-MANUAL-STEPS.md",
    "build-agent.yml",
    "vendor-ffmpeg-windows.yml",
    "vendor-ffmpeg-windows-v2.yml",
    "verify/VERIFY_AUTH_METHODS.sql",
  ];

  for (const path of retiredRoot) {
    assert.equal(existsSync(path), false, `${path} não deve voltar à raiz`);
  }

  assert.equal(existsSync(".github/workflows/build-agent.yml"), true);
  assert.equal(existsSync(".github/workflows/vendor-ffmpeg-windows-v2.yml"), true);
  assert.equal(existsSync("test/fixtures/meeting-rtmp-bridge/README.md"), true);
  assert.equal(existsSync("docs/pilots/MEETING-RTMP-INFANCIA.md"), true);
  assert.equal(existsSync("docs/marketing/ANALYTICS-GTM-SETUP.md"), true);
  assert.equal(existsSync("docs/integrations/OPENAI-MCP-REVIEW.md"), true);

  const gitignore = readFileSync(".gitignore", "utf8");
  assert.match(gitignore, /^\*\.tsbuildinfo$/m);
});

test("fontes atuais não apontam para o antigo plano de produção", () => {
  const landing = readFileSync("src/lib/landing-content.ts", "utf8");
  const structured = readFileSync(
    "src/components/seo/monitoria-structured-data.tsx",
    "utf8",
  );
  const readme = readFileSync("README.md", "utf8");

  for (const text of [landing, structured, readme]) {
    assert.doesNotMatch(text, /PLANO-DE-PRODUCAO\.md/);
  }

  assert.match(landing, /docs\/PRODUCT-CONTRACT\.md/);
});

test("canonização preserva freeze 1.0.3 e piloto Luna isolado no VIP", () => {
  const agents = readFileSync("AGENTS.md", "utf8");
  const continuity = readFileSync("README-CONTINUIDADE.md", "utf8");
  const product = readFileSync("docs/PRODUCT-CONTRACT.md", "utf8");

  for (const text of [agents, continuity, product]) {
    assert.match(text, /gpt-5-nano/);
    assert.match(text, /gpt-6-luna/);
  }

  assert.match(agents, /Agent 1\.0\.3/);
  assert.match(agents, /não alterar `agent\/\*\*`/i);
});
