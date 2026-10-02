import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("landing VIP replica a arquitetura visual da landing padrão", async () => {
  const [page, story, commerce] = await Promise.all([
    read("app/vip/landing/page.tsx"),
    read("src/components/vip-landing/story.tsx"),
    read("src/components/vip-landing/commerce.tsx"),
  ]);
  const source = `${page}\n${story}\n${commerce}`;

  assert.match(page, /styles\.rail/);
  assert.match(page, /styles\.railFill/);
  assert.match(source, /styles\.recede/);
  assert.match(source, /styles\.wipe/);
  assert.match(source, /styles\.stagger/);
  assert.match(story, /styles\.floatMedia/);
  assert.match(source, /styles\.sectorStack/);
  assert.match(source, /styles\.problemGrid/);
  assert.match(source, /styles\.trial/);
  assert.match(source, /styles\.faqList/);
});

test("copy VIP vende valor para os três públicos prioritários", async () => {
  const content = await read("src/lib/vip-landing-content.ts");

  assert.match(content, /Grandes empresas/);
  assert.match(content, /Empresas de segurança/);
  assert.match(content, /Projetos científicos/);
  assert.match(content, /Muitas câmeras\./);
  assert.match(content, /Uma operação pesquisável\./);
  assert.match(content, /continuidade/i);
  assert.match(content, /saúde/i);
  assert.match(content, /gravações locais/i);
});

test("tema usa dourado metálico e não amarelo chapado", async () => {
  const css = await read("app/vip/landing/vip-landing.module.css");

  assert.match(css, /linear-gradient[\s\S]*#f5df91/i);
  assert.match(css, /#fff1b1/i);
  assert.match(css, /#79500d/i);
  assert.match(css, /goldButtonSweep/);
  assert.match(css, /goldTextSweep/);
  assert.doesNotMatch(css, /background:\s*#d4af37\s*[;}]/i);
});

test("logo e favicon VIP usam a mesma marca em dourado sem alterar o manifest TWA", async () => {
  const [hero, page, favicon, manifest] = await Promise.all([
    read("src/components/vip-landing/hero.tsx"),
    read("app/vip/landing/page.tsx"),
    read("public/vip-favicon.svg"),
    read("app/manifest.ts"),
  ]);

  assert.match(hero, /\/vip-favicon\.svg/);
  assert.match(page, /\/vip-favicon\.svg/);
  assert.match(favicon, /linearGradient id="vipGold"/);
  assert.match(favicon, /#FFF1AF/i);
  assert.doesNotMatch(manifest, /vip-favicon/);
  assert.match(manifest, /android-chrome-192x192\.png/);
});

test("landing VIP mantém preços vindos do catálogo em vez de valores escritos à mão", async () => {
  const [page, commerce] = await Promise.all([
    read("app/vip/landing/page.tsx"),
    read("src/components/vip-landing/commerce.tsx"),
  ]);

  assert.match(page, /getVipPlanCatalog/);
  assert.match(commerce, /monthlyAmountCents/);
  assert.match(commerce, /annualAmountCents/);
  assert.match(commerce, /excessCameraMonthlyCents/);
  assert.doesNotMatch(commerce, /1\.299|4\.999|11\.990/);
});

test("VIP não replica badges de lojas nem altera o caminho do TWA", async () => {
  const [hero, manifest] = await Promise.all([
    read("src/components/vip-landing/hero.tsx"),
    read("app/manifest.ts"),
  ]);

  assert.doesNotMatch(hero, /playstore|microsoft-store/i);
  assert.match(manifest, /start_url:\s*"\/login"/);
  assert.match(manifest, /name:\s*appConfig\.name/);
});

test("cenas VIP preservam movimento em SVG sem JavaScript cliente", async () => {
  const scenes = await read("src/components/vip-landing/scenes.tsx");

  assert.match(scenes, /styles\.sIn/);
  assert.match(scenes, /styles\.sPulse/);
  assert.match(scenes, /styles\.sGrow/);
  // A landing continua animada sem obrigar cada cena a usar uma classe
  // específica de wipe. Esse era um contrato textual antigo, não produto.
  assert.doesNotMatch(scenes, /"use client"/);
});

test("SEO VIP possui favicon, canonical, social image e structured data próprios", async () => {
  const [page, structured, og] = await Promise.all([
    read("app/vip/landing/page.tsx"),
    read("src/components/vip-landing/structured-data.tsx"),
    read("app/vip/landing/opengraph-image.tsx"),
  ]);

  assert.match(page, /canonical:\s*vipConfig\.url/);
  assert.match(page, /vip-favicon\.svg/);
  assert.match(page, /vip\/landing\/opengraph-image/);
  assert.match(structured, /SoftwareApplication/);
  assert.match(structured, /FAQPage/);
  assert.match(og, /Uma operação pesquisável/);
});
