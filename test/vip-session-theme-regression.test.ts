import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("refresh token inválido é limpo antes de repetir o fluxo de login", async () => {
  const proxy = await read("src/lib/supabase/proxy.ts");

  assert.match(proxy, /refresh_token_not_found/);
  assert.match(proxy, /invalid refresh token\|refresh token not found/i);
  assert.match(proxy, /clearInvalidAuthCookies/);
  assert.match(proxy, /Domain=\$\{domain\}/);
  assert.match(proxy, /pathname\.startsWith\("\/auth\/confirm"\)/);
  assert.match(proxy, /clearLegacyHostOnlyAuthCookies/);
});

test("onboarding VIP herda dourado sem mudar o fallback Standard", async () => {
  const [
    page,
    vipCss,
    installer,
    discovery,
    context,
    sales,
  ] = await Promise.all([
    read("app/vip/onboarding/page.tsx"),
    read("app/vip/onboarding/vip-onboarding.module.css"),
    read("src/components/installer-platform-actions.module.css"),
    read("app/dashboard/cameras/discovery/discovery.module.css"),
    read("app/dashboard/onboarding-camera-context.module.css"),
    read("app/dashboard/trial/sales/sales-trial.module.css"),
  ]);

  assert.match(page, /\/vip-favicon\.svg/);
  assert.match(vipCss, /--monitoria-accent:#d4af37/);
  assert.match(vipCss, /--monitoria-primary-gradient:/);
  assert.match(vipCss, /panel-primary-action/);

  assert.match(installer, /var\(--monitoria-primary-gradient/);
  assert.match(installer, /#57e6c7/);
  assert.match(discovery, /var\(--monitoria-accent-strong/);
  assert.match(context, /var\(--monitoria-accent/);
  assert.match(sales, /var\(--monitoria-primary-gradient/);
});
