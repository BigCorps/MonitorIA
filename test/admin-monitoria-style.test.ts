import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin MonitorIA preserva o gate de acesso por e-mail próprio", async () => {
  const source = await read("src/lib/internal-operator.ts");
  assert.match(source, /MONITORIA_INTERNAL_OPERATOR_EMAILS/);
  assert.match(source, /requireInternalOperator/);
});

test("admin possui navegação densa inspirada no painel minhAi", async () => {
  const source = await read("app/dashboard/admin/admin-shell.tsx");
  for (const label of [
    "Visão Geral",
    "Clientes",
    "Financeiro",
    "IA & custos",
    "Operação",
    "Infraestrutura",
    "Atenção",
    "Release",
    "Auditoria",
  ]) {
    assert.ok(source.includes(label), `faltou ${label}`);
  }
});

test("visão geral traz métricas operacionais reais da MonitorIA", async () => {
  const source = await read("src/lib/admin-overview-data.ts");
  for (const table of [
    "organizations",
    "cameras",
    "agents",
    "camera_subscriptions",
    "trial_runs",
    "billing_invoices",
    "billing_pix_payments",
    "camera_health_incidents",
    "ai_cost_alerts",
  ]) {
    assert.ok(source.includes(`from("${table}")`), `faltou ${table}`);
  }
});

test("admin não importa autenticação da minhAi", async () => {
  const paths = [
    "app/dashboard/admin/page.tsx",
    "app/dashboard/admin/finance/page.tsx",
    "app/dashboard/admin/attention/page.tsx",
    "app/dashboard/admin/operations/page.tsx",
    "app/dashboard/admin/ai/page.tsx",
    "app/dashboard/admin/customers/page.tsx",
    "app/dashboard/admin/infrastructure/page.tsx",
    "app/dashboard/admin/audit/page.tsx",
    "app/dashboard/admin/launch/page.tsx",
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /requireInternalOperator/);
    assert.doesNotMatch(source, /getPlatformAdminAccess|admin\.minhai\.app/);
  }
});

test("release do admin mostra versão final 1.0.3", async () => {
  const source = await read("app/dashboard/admin/launch/page.tsx");
  assert.match(source, /MONITORIA 1\.0\.3/);
});
