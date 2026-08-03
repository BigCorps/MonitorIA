import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Node fica fixado na linha 22", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.engines.node, "22.x");
});

test("todos os crons necessários estão declarados", () => {
  const vercel = JSON.parse(read("vercel.json"));
  const paths = new Set(vercel.crons.map((item) => item.path));
  for (const required of [
    "/api/cron/billing",
    "/api/cron/trials",
    "/api/cron/camera-health",
    "/api/cron/processes",
    "/api/cron/staff-profiles",
    "/api/cron/routines",
    "/api/cron/ai-usage",
    "/api/cron/assistant-credits",
    "/api/cron/retention",
  ]) {
    assert.ok(paths.has(required), `cron ausente: ${required}`);
  }
});

test("cobrança aceita JWT service_role validado pelo gateway", () => {
  const edge = read("supabase/functions/monitoria-process-billing/index.ts");
  assert.match(edge, /role === "service_role"/);
  assert.match(edge, /issuer === expectedIssuer/);
  assert.match(edge, /notExpired/);
});

test("migration pós-auditoria inclui segurança, RLS e índices", () => {
  const sql = read(
    "supabase/migrations/20260803204000_post_audit_security_performance.sql",
  );
  assert.match(sql, /revoke all on function public\.mcp_get_capabilities/);
  assert.match(sql, /select auth\.uid\(\)/);
  assert.match(sql, /create index if not exists/);
  assert.match(sql, /commit;/);
});
