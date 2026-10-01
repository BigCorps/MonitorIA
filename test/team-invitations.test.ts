import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("equipe possui convite seguro, expiração e papéis sem transferir owner", async () => {
  const [migration, actions] = await Promise.all([
    readFile(
      new URL(
        "../supabase/migrations/20260930193000_organization_team_invites.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/dashboard/team/actions.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(migration, /organization_invitations/);
  assert.match(migration, /role <> 'owner'/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /expires_at timestamptz not null/);
  assert.match(migration, /revoke all on table public\.organization_invitations from anon, authenticated/);
  assert.match(actions, /randomBytes\(32\)/);
  assert.match(actions, /createHash\("sha256"\)/);
  assert.match(actions, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(actions, /Somente o proprietário pode convidar outro administrador/);
});

test("aceite exige a mesma conta de e-mail que recebeu o convite", async () => {
  const actions = await readFile(
    new URL("../app/join/[token]/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(actions, /userEmail !== inviteEmail/);
  assert.match(actions, /accepted_by: user\.id/);
  assert.match(actions, /accepted_at: new Date\(\)\.toISOString\(\)/);
  assert.match(actions, /team_invite_accepted/);
});

test("painel orienta Administrador para equipe técnica", async () => {
  const [page, manager, navigation] = await Promise.all([
    readFile(new URL("../app/dashboard/team/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/team/team-manager.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/dashboard-navigation.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Para técnicos que precisam instalar Agents/);
  assert.match(manager, /Ideal para a equipe técnica/);
  assert.match(manager, /Operador/);
  assert.match(manager, /Visualizador/);
  assert.match(navigation, /label: "Equipe"/);
  assert.match(navigation, /href: "\/dashboard\/team"/);
});

test("convite por e-mail tem fallback de link copiável", async () => {
  const [notification, manager] = await Promise.all([
    readFile(new URL("../src/lib/team-notification.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/team/team-manager.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(notification, /RESEND_API_KEY/);
  assert.match(notification, /Aceitar convite/);
  assert.match(manager, /Copiar link/);
  const actions = await readFile(
    new URL("../app/dashboard/team/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(manager, /state\.message/);
  assert.match(actions, /O e-mail automático não saiu/);
});
