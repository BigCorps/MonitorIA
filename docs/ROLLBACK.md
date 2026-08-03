# Rollback

## Emergência de login

Se o Auth Hook impedir os logins:

1. Abra o Supabase Dashboard.
2. Vá a `Authentication → Hooks`.
3. Desative o Custom Access Token Hook.
4. Não apague imediatamente os dados das preferências.
5. Verifique o log de Auth e o SQL antes de reativar.

Sem o hook, senha, Magic Link, Google e passkey voltam a seguir apenas a configuração global do Supabase.

## Remover enforcement RLS

Execute primeiro:

```text
backend/rollback/20260801170510_mfa_rls_enforcement.rollback.sql
```

## Remover a estrutura principal

Desative o Auth Hook no Dashboard e execute:

```text
backend/rollback/20260801170500_auth_preferences_and_mfa.rollback.sql
```

## Reverter frontend

Com Git:

```bash
git restore app/login/page.tsx

git restore app/login/actions.ts

git restore app/auth/callback/route.ts

git restore app/dashboard/layout.tsx

git restore app/dashboard/profile/page.tsx

git restore src/lib/supabase/client.ts

git restore src/lib/supabase/proxy.ts

git clean -f \
  app/login/auth-buttons.tsx \
  app/login/login-auth.module.css \
  app/auth/mfa/page.tsx \
  app/auth/mfa/mfa-challenge.tsx \
  app/auth/mfa/mfa.module.css \
  app/dashboard/profile/security-settings.tsx \
  app/dashboard/profile/security-settings.module.css
```

Também é possível recuperar o Perfil pelo arquivo:

```text
app/dashboard/profile/page.tsx.monitoria-auth-backup
```
