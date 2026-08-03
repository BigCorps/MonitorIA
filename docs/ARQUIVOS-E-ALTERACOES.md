# Arquivos e alterações

## Arquivos substituídos pelo overlay

```text
app/login/page.tsx
app/login/actions.ts
app/auth/callback/route.ts
app/dashboard/layout.tsx
src/lib/supabase/client.ts
src/lib/supabase/proxy.ts
```

## Arquivos novos

```text
app/login/auth-buttons.tsx
app/login/login-auth.module.css
app/auth/mfa/page.tsx
app/auth/mfa/mfa-challenge.tsx
app/auth/mfa/mfa.module.css
app/dashboard/profile/security-settings.tsx
app/dashboard/profile/security-settings.module.css
```

## Arquivo alterado pelo aplicador

```text
app/dashboard/profile/page.tsx
```

O aplicador:

- adiciona o import de `SecuritySettings`;
- insere o painel depois do bloco de Magic Link;
- cria `app/dashboard/profile/page.tsx.monitoria-auth-backup`.

## Backend

```text
backend/migrations/20260801170500_auth_preferences_and_mfa.sql
backend/migrations/20260801170510_mfa_rls_enforcement.sql
```

## Não há Edge Functions WebAuthn

As passkeys são gerenciadas diretamente pelo Supabase Auth. Não há `JWT_SECRET`, criação manual de sessão, escrita em `auth.sessions` ou tabela pública de credenciais.
