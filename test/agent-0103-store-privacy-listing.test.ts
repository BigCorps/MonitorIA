import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const privacy = readFileSync("app/privacidade/page.tsx", "utf8");
const security = readFileSync("app/seguranca-e-privacidade/page.tsx", "utf8");
const retention = readFileSync("app/retencao/page.tsx", "utf8");
const subprocessors = readFileSync("app/subprocessadores/page.tsx", "utf8");
const deletion = readFileSync("app/excluir-conta/page.tsx", "utf8");
const terms = readFileSync("app/termos/page.tsx", "utf8");
const footer = readFileSync("src/components/landing/hero.tsx", "utf8");
const listing = readFileSync(
  "docs/MONITORIA-1.0.3-MICROSOFT-STORE-LISTING-PT-BR.md",
  "utf8",
);
const certification = readFileSync(
  "docs/MONITORIA-1.0.3-MICROSOFT-STORE-CERTIFICATION.md",
  "utf8",
);
const retiredSampler = readFileSync(
  ".github/workflows/build-agent-rtsp-sampler-test.yml",
  "utf8",
);

test("rotas públicas de privacidade cobrem o produto 1.0.3 atual", () => {
  assert.match(privacy, /Última atualização: 29 de agosto de 2026/);
  assert.match(privacy, /reconhecimento facial/i);
  assert.match(privacy, /probabilístic/i);
  assert.match(privacy, /OpenAI/);
  assert.match(privacy, /store: false/);
  assert.match(privacy, /3 dias/);
  assert.match(privacy, /365 dias/);
  assert.match(privacy, /30 dias/);
  assert.match(privacy, /7 dias/);
  assert.match(privacy, /MCP/);
  assert.match(privacy, /15 dias/);

  assert.match(security, /Sem reconhecimento facial ou identificação civil/);
  assert.match(security, /Continuidade operacional não biométrica/);
  assert.match(security, /não confirma identidade/i);
  assert.doesNotMatch(
    security,
    /não tenta identificar pessoas nem manter uma identidade entre eventos/i,
  );

  assert.match(retention, /3 dias/);
  assert.match(retention, /365 dias/);
  assert.match(retention, /30 dias/);
  assert.match(retention, /7 dias/);
  assert.match(retention, /snapshot da política/i);

  assert.match(subprocessors, /Supabase/);
  assert.match(subprocessors, /Vercel/);
  assert.match(subprocessors, /OpenAI/);
  assert.match(subprocessors, /Microsoft Clarity/);
  assert.match(subprocessors, /store: false/);

  assert.match(deletion, /acessível sem login/i);
  assert.match(deletion, /15 dias/);
  assert.match(terms, /Termos de uso/);

  for (const route of [
    "/seguranca-e-privacidade",
    "/privacidade",
    "/retencao",
    "/subprocessadores",
    "/termos",
  ]) {
    assert.match(footer, new RegExp(route.replaceAll("/", "\\/")));
  }
});

test("listing Store está dentro dos limites e documenta as limitações importantes", () => {
  assert.match(listing, /Produto: MonitorIA/);
  assert.match(listing, /Categoria recomendada: Empresas > Dados \+ análises/);
  assert.match(listing, /https:\/\/monitoria\.cam\/privacidade/);
  assert.match(listing, /https:\/\/monitoria\.cam\/contato/);
  assert.match(listing, /https:\/\/monitoria\.cam\/termos/);
  assert.match(listing, /\/VERYSILENT \/SUPPRESSMSGBOXES \/NORESTART \/SP-/);
  assert.match(listing, /Windows 10\/11/);
  assert.match(listing, /DVR, NVR ou câmera compatível/);
  assert.match(listing, /não substitui DVR, NVR, alarmes, vigilância humana/i);
  assert.match(listing, /Assinatura/);
  assert.match(listing, /não biométrica/i);
  assert.match(listing, /1 screenshot/i);
  assert.match(listing, /5–8 screenshots/i);
});

test("auditoria Store reconhece política pública e mantém travas de publicação", () => {
  assert.match(certification, /PRIVACIDADE PÚBLICA — FECHADO/);
  assert.match(certification, /\/privacidade/);
  assert.match(certification, /não criar `agent-v1\.0\.3`/);
  assert.match(certification, /URL HTTPS imutável/i);
  assert.match(certification, /máquina\/usuário limpo|ambiente limpo/i);
});

test("workflow RTSP aposentado é manual e não gera falso vermelho em push", () => {
  assert.match(retiredSampler, /workflow_dispatch:/);
  assert.doesNotMatch(retiredSampler, /^\s*push:/m);
  assert.match(retiredSampler, /Sampler retired in 1\.0\.2/);
});
