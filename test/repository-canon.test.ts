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
