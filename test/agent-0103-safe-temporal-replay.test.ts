import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260901153413_safe_temporal_replay_v103.sql",
  import.meta.url,
);

test("replay histórico não fecha sessão operacional que começou no futuro", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /new\.closed_at < old\.first_open_observed_at/,
  );
  assert.match(
    sql,
    /monitoria_guard_operating_session_temporal_replay_v1/,
  );
  assert.match(
    sql,
    /site_operating_sessions_00_temporal_replay_guard_v103/,
  );

  const temporalGuard = sql.slice(
    sql.indexOf("create or replace function private.monitoria_guard_operating_session_temporal_replay_v1"),
  );

  assert.match(temporalGuard, /return old;/i);
});

test("replay histórico preserva observação mas não regride estado visual atual", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /select max\(observation\.observed_at\)/);
  assert.match(sql, /observation\.visibility = 'clear'/);
  assert.match(sql, /observation\.observed_state <> 'unknown'/);
  assert.match(sql, /observation\.confidence >= v_min_confidence/);
  assert.match(
    sql,
    /new\.last_observed_at < v_latest_eligible_at/,
  );
  assert.match(
    sql,
    /visual_entity_current_states_00_chronology_guard_v103/,
  );
});

test("guardas temporais são BEFORE triggers e não removem a constraint de integridade", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /create trigger visual_entity_current_states_00_chronology_guard_v103\s+before update/is,
  );
  assert.match(
    sql,
    /create trigger site_operating_sessions_00_temporal_replay_guard_v103\s+before update of status, closed_at/is,
  );
  assert.doesNotMatch(
    sql,
    /drop constraint\s+site_operating_sessions_time_check/i,
  );
  assert.doesNotMatch(
    sql,
    /alter table[\s\S]*site_operating_sessions_time_check/i,
  );
});
