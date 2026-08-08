import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20260808234500_event_review_management.sql",
  import.meta.url,
);
const actionsPath = new URL(
  "../app/dashboard/events/actions.ts",
  import.meta.url,
);
const detailPath = new URL(
  "../app/dashboard/events/[eventId]/page.tsx",
  import.meta.url,
);

test("a migração permite editar e excluir revisões com auditoria", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /add column if not exists updated_at timestamptz/i);
  assert.match(sql, /function public\.update_monitoria_event_review/i);
  assert.match(sql, /function public\.delete_monitoria_event_review/i);
  assert.match(sql, /private\.sync_monitoria_event_review_snapshot/i);
  assert.match(sql, /event\.review_updated/i);
  assert.match(sql, /event\.review_deleted/i);
  assert.match(sql, /private\.is_org_member/i);
});

test("as ações usam as RPCs de manutenção e preservam o contexto", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /update_monitoria_event_review/);
  assert.match(source, /delete_monitoria_event_review/);
  assert.match(source, /detail_query/);
  assert.match(source, /review_deleted/);
});

test("o detalhe oferece navegação sequencial e edição do histórico", async () => {
  const source = await readFile(detailPath, "utf8");

  assert.match(source, /getEventNavigation/);
  assert.match(source, /← Anterior/);
  assert.match(source, /Próximo →/);
  assert.match(source, /Editar revisão/);
  assert.match(source, /ReviewDeleteForm/);
});
