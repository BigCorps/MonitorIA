import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("apresentação assistida esconde o token da landing e do Clarity", async () => {
  const [entry, start, tracker, landing] = await Promise.all([
    read("app/apresentacao/[token]/route.ts"),
    read("app/comecar/route.ts"),
    read("src/components/vip-landing/assisted-journey.tsx"),
    read("app/vip/landing/page.tsx"),
  ]);

  assert.match(entry, /httpOnly:\s*true/);
  assert.match(entry, /VIP_ASSIST_COOKIE/);
  assert.match(entry, /new URL\("\/", request\.url\)/);
  assert.match(start, /\/lead\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(tracker, /clarity\("identify"/);
  assert.match(tracker, /vip_alias/);
  assert.doesNotMatch(tracker, /sales_trial|token_hash|rawToken/);
  assert.match(landing, /cookies\(\)/);
  assert.match(landing, /VipAssistedClosing/);
});

test("landing assistida substitui formulário por começo guiado e VIP fica noindex", async () => {
  const [landing, closing] = await Promise.all([
    read("app/vip/landing/page.tsx"),
    read("src/components/vip-landing/assisted-closing.tsx"),
  ]);

  assert.match(landing, /index:\s*false/);
  assert.match(landing, /follow:\s*false/);
  assert.match(landing, /assisted\s*&&/);
  assert.match(closing, /Está pronto\? Vamos começar/);
  assert.match(closing, /Estou pronto\. Vamos começar/);
  assert.match(closing, /href="\/comecar"/);
  assert.match(closing, /O relógio do piloto não começa/);
});

test("VIP vende corretamente evidência em vídeo do modo Intensive", async () => {
  const evidence = await read("src/components/vip-landing/video-evidence.tsx");
  const policy = await read("src/clips/policy.ts");

  assert.match(evidence, /MONITORIA_CLIP_MAX_DURATION_SECONDS/);
  assert.match(evidence, /MONITORIA_CLIP_RETENTION_DAYS/);
  assert.match(evidence, /expectedLongTermEvidenceCount\("intensive"\)/);
  assert.match(evidence, /vídeo do acontecimento/i);
  assert.match(evidence, /Assistir e baixar/i);
  assert.match(evidence, /gravação contínua/i);
  assert.match(policy, /MONITORIA_CLIP_MAX_DURATION_SECONDS = 310/);
  assert.match(policy, /MONITORIA_CLIP_RETENTION_DAYS = 30/);
});

test("dashboard continua reproduzindo e baixando preserved_clip", async () => {
  const [detail, media] = await Promise.all([
    read("app/dashboard/events/[eventId]/page.tsx"),
    read("app/dashboard/events/[eventId]/event-media.tsx"),
  ]);

  assert.match(detail, /kind === "preserved_clip"/);
  assert.match(media, /▶ Assistir vídeo/);
  assert.match(media, /↓ Baixar vídeo/);
  assert.match(media, /<video/);
  assert.match(media, /\/api\/storage-assets\/\$\{clip\.id\}/);
});

test("vendedor pode criar apresentação sem formulário público e acompanha o mesmo projeto", async () => {
  const [action, page, live] = await Promise.all([
    read("app/comercial/vip/nova/actions.ts"),
    read("app/comercial/vip/nova/page.tsx"),
    read("app/comercial/vip/[projectId]/acompanhar/page.tsx"),
  ]);

  assert.match(action, /convert_vip_lead_request_v1/);
  assert.match(action, /vip_sales_assisted/);
  assert.match(page, /\/apresentacao\/\$\{encodeURIComponent\(token\)\}/);
  assert.match(page, /Acompanhar lead/);
  assert.match(live, /vipProgressPercent/);
  assert.match(live, /vipNextAction/);
  assert.match(live, /TrialCountdown/);
  assert.match(live, /VÍDEOS PRESERVADOS/);
  assert.match(live, /results\?\.clipCount/);
});

test("Clarity permanece fora das telas privadas do onboarding", async () => {
  const [clarity, onboarding, seller] = await Promise.all([
    read("src/components/analytics/clarity.tsx"),
    read("app/vip/onboarding/page.tsx"),
    read("app/comercial/vip/[projectId]/acompanhar/page.tsx"),
  ]);

  assert.match(clarity, /NUNCA.*dashboard/is);
  assert.doesNotMatch(onboarding, /ClarityScript/);
  assert.doesNotMatch(seller, /ClarityScript/);
  assert.match(seller, /imagens\/keyframes/);
});
