import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pixel = readFileSync("src/lib/openai-ads.ts", "utf8");
const bootstrap = readFileSync(
  "src/components/analytics/openai-ads-bootstrap.tsx",
  "utf8",
);
const layout = readFileSync("app/layout.tsx", "utf8");
const analytics = readFileSync(
  "src/components/analytics/monitoria-analytics.tsx",
  "utf8",
);
const consent = readFileSync(
  "src/components/analytics/cookie-consent.tsx",
  "utf8",
);
const trialAction = readFileSync("app/dashboard/trial/actions.ts", "utf8");
const envExample = readFileSync(".env.example", "utf8");

test("pixel da OpenAI usa configuração pública, consentimento e SDK oficiais", () => {
  assert.match(pixel, /NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID/);
  assert.match(pixel, /NEXT_PUBLIC_OPENAI_ADS_DEBUG/);
  assert.match(pixel, /https:\/\/bzrcdn\.openai\.com\/sdk\/oaiq\.min\.js/);
  assert.match(bootstrap, /strategy="beforeInteractive"/);
  assert.match(bootstrap, /q\.q\.push\(arguments\)/);
  assert.match(bootstrap, /w\.oaiq\("consent", granted\)/);
  assert.match(bootstrap, /w\.oaiq\("init"/);
  assert.match(layout, /<OpenAiAdsBootstrap \/>/);
  assert.match(pixel, /oaiq\('consent', analyticsConsentGranted\(\)\)/);
  assert.match(pixel, /oaiq\('init', debug \? \{ pixelId, debug: true \} : \{ pixelId \}\)/);
  assert.match(consent, /applyOpenAiAdsConsent\(granted\)/);
  assert.match(envExample, /NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID=/);
  assert.match(envExample, /NEXT_PUBLIC_OPENAI_ADS_DEBUG=false/);
});

test("conversão trial_started depende do início real e não envia identificadores", () => {
  assert.match(trialAction, /if \(!duplicate\) destination\.set\("conversion", "trial_started"\)/);
  assert.match(analytics, /measureOpenAiAdsTrialStartedOnce\(\)/);
  assert.match(pixel, /oaiq\('measure', 'trial_started'/);
  assert.match(pixel, /type: 'plan_enrollment'/);
  assert.match(pixel, /plan_id: 'monitoria_self_service_24h'/);
  assert.doesNotMatch(pixel, /user_id|organization_id|email|phone|advanced_matching/i);
});
