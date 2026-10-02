import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsUrl = new URL(
  "../app/join/[token]/actions.ts",
  import.meta.url,
);
const migrationUrl = new URL(
  "../supabase/migrations/20261002175500_organization_team_invite_access_codes.sql",
  import.meta.url,
);

test("convite de equipe usa código próprio em vez de email_otp", async () => {
  const [actions, migration] = await Promise.all([
    readFile(actionsUrl, "utf8"),
    readFile(migrationUrl, "utf8"),
  ]);

  assert.match(actions, /randomInt\(0,\s*1_000_000\)/);
  assert.match(actions, /createHmac\("sha256"/);
  assert.match(actions, /access_code_hash/);
  assert.match(actions, /access_code_expires_at/);
  assert.match(actions, /ACCESS_CODE_MAX_ATTEMPTS\s*=\s*5/);
  assert.doesNotMatch(actions, /properties\?\.email_otp/);
  assert.match(actions, /properties\.hashed_token/);
  assert.match(actions, /type:\s*"magiclink"/);

  assert.match(migration, /add column if not exists access_code_hash text/);
  assert.match(migration, /access_code_attempts smallint not null default 0/);
});
