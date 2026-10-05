import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("entrada VIP usa gate próprio e não cria loop para conta Standard", async () => {
  const [
    hero,
    proxy,
    access,
    dashboardLayout,
    onboardingLayout,
    onboardingPage,
    onboardingActions,
    closingPage,
    closingActions,
  ] = await Promise.all([
    read("src/components/vip-landing/hero.tsx"),
    read("src/lib/supabase/proxy.ts"),
    read("app/vip/access/page.tsx"),
    read("app/vip/dashboard/layout.tsx"),
    read("app/vip/onboarding/layout.tsx"),
    read("app/vip/onboarding/page.tsx"),
    read("app/vip/onboarding/actions.ts"),
    read("app/vip/closing/page.tsx"),
    read("app/vip/closing/actions.ts"),
  ]);

  assert.match(hero, /href="\/vip\/access"/);
  assert.match(proxy, /"\/vip\/access"/);
  assert.match(access, /ainda não possui um Projeto VIP ativo/);
  assert.match(access, /mesma conta/);

  for (const source of [
    dashboardLayout,
    onboardingLayout,
    onboardingPage,
    onboardingActions,
    closingPage,
    closingActions,
  ]) {
    assert.doesNotMatch(source, /redirect\("\/dashboard"\)/);
  }

  const projectCheck = onboardingPage.indexOf(
    "getVipProjectForOrganization(organization.id)",
  );
  const trialEnsure = onboardingPage.indexOf(
    "ensureSalesTrialForOrganization(user, organization.id)",
  );
  assert.ok(projectCheck >= 0);
  assert.ok(trialEnsure > projectCheck);
});

test("login compartilhado respeita next VIP para sessão já autenticada", async () => {
  const page = await read("app/login/page.tsx");

  assert.match(page, /const isVipLogin = next\.startsWith\("\/vip\/"\)/);
  assert.match(page, /if \(user\) redirect\(next\)/);
  assert.match(page, /ACESSO MONITORIA VIP/);
  assert.match(page, /Entrar no MonitorIA VIP/);
});

test("card de cookies usa identidade dourada somente no host VIP", async () => {
  const cookie = await read("src/components/analytics/cookie-consent.tsx");

  assert.match(cookie, /window\.location\.hostname\.toLowerCase\(\) === "vip\.monitoria\.cam"/);
  assert.match(cookie, /data-experience=\{vip \? "vip" : "standard"\}/);
  assert.match(cookie, /#e2bd59/);
  assert.match(cookie, /rgba\(224,202,143,\.28\)/);
  assert.match(cookie, /linear-gradient\(112deg,#8a5c12,#d7ac43/);
});
