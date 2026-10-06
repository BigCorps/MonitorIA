import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("VIP permite sair e trocar de conta em todas as fases autenticadas", async () => {
  const [onboarding, dashboard, closing, signout] = await Promise.all([
    read("app/vip/onboarding/page.tsx"),
    read("app/vip/dashboard/layout.tsx"),
    read("app/vip/closing/page.tsx"),
    read("app/auth/signout/route.ts"),
  ]);

  for (const source of [onboarding, dashboard, closing]) {
    assert.match(source, /action="\/auth\/signout"/);
    assert.match(source, /Sair \/ trocar conta/);
  }

  assert.match(signout, /appConfig\.url/);
  assert.match(signout, /Domain=\.monitoria\.cam/);
  assert.match(signout, /Max-Age=0/);
});

test("acompanhamento VIP atualiza em até 3 segundos e ao voltar à aba", async () => {
  const [refresh, livePage, commercial] = await Promise.all([
    read("src/components/vip-live-refresh.tsx"),
    read("app/comercial/vip/[projectId]/acompanhar/page.tsx"),
    read("app/comercial/vip/page.tsx"),
  ]);

  assert.match(refresh, /visibilitychange/);
  assert.match(refresh, /window\.addEventListener\("focus"/);
  assert.match(refresh, /document\.visibilityState === "visible"/);
  assert.match(livePage, /intervalMs=\{3_000\}/);
  assert.match(livePage, /Atualização automática · até 3 s/);
  assert.match(commercial, /Acompanhar ao vivo/);
});
