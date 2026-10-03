import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateVideoVolume } from "../src/landing/video-volume.js";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("calculadora usa apenas a matemática declarada pelo visitante", () => {
  const standard = calculateVideoVolume(8, 24);
  assert.equal(standard.dailyHours, 192);
  assert.equal(standard.monthlyHours, 5760);
  assert.equal(standard.workdaysForOneDay, 24);

  const vip = calculateVideoVolume(50, 24);
  assert.equal(vip.dailyHours, 1200);
  assert.equal(vip.monthlyHours, 36000);
  assert.equal(vip.workdaysForOneDay, 150);
});

test("landing padrão vende a dor antes de apresentar setores", async () => {
  const [page, hero] = await Promise.all([
    read("app/page.tsx"),
    read("src/components/landing/hero.tsx"),
  ]);

  assert.match(page, /<Problem \/>/);
  assert.match(page, /<SalesProof experience="standard" \/>/);
  assert.match(page, /<Sectors \/>/);
  assert.ok(page.indexOf("<Problem />") < page.indexOf("<Sectors />"));
  assert.ok(page.indexOf("<SalesProof experience=\"standard\" />") < page.indexOf("<Sectors />"));
  assert.match(hero, /Você já tem câmeras\./);
  assert.match(hero, /Encontre o que elas viram\./);
  assert.match(hero, /appConfig\.slogan/);
  assert.match(hero, /Testar nas minhas câmeras/);
});

test("VIP preserva hero premium e antecipa dor + prova antes dos setores", async () => {
  const [page, content] = await Promise.all([
    read("app/vip/landing/page.tsx"),
    read("src/lib/vip-landing-content.ts"),
  ]);

  assert.match(page, /<VipProblem \/>/);
  assert.match(page, /<SalesProof experience="vip" \/>/);
  assert.match(page, /<VipSectors \/>/);
  assert.ok(page.indexOf("<VipProblem />") < page.indexOf("<VipSectors />"));
  assert.ok(page.indexOf("<SalesProof experience=\"vip\" />") < page.indexOf("<VipSectors />"));
  assert.match(content, /Muitas câmeras\./);
  assert.match(content, /Uma operação pesquisável\./);
});

test("prova comercial não inventa ROI nem economia", async () => {
  const proof = await read("src/components/landing/sales-proof.tsx");

  assert.match(proof, /Nenhuma estimativa de economia ou produtividade é aplicada/);
  assert.match(proof, /Conta transparente/);
  assert.doesNotMatch(proof, /economia garantida|reduz .*%|aumenta .*%/i);
  assert.match(proof, /correspondência provável/);
});

test("Gate Comercial não altera os contratos de trial ou backend", async () => {
  const [standard, vip] = await Promise.all([
    read("app/page.tsx"),
    read("app/vip/landing/page.tsx"),
  ]);

  assert.match(standard, /<Trial \/>/);
  assert.match(vip, /getVipPlanCatalog/);
  assert.match(vip, /<VipTrial \/>/);
  assert.match(vip, /<VipClosing query=\{query\} \/>/);
});
