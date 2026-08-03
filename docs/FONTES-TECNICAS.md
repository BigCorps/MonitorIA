# Fontes técnicas oficiais consultadas

Consultadas em 1º de agosto de 2026.

## Supabase Passkeys

- Guia: https://supabase.com/docs/guides/auth/passkeys
- JavaScript registerPasskey: https://supabase.com/docs/reference/javascript/auth-registerpasskey
- JavaScript signInWithPasskey: https://supabase.com/docs/reference/javascript/auth-signinwithpasskey
- JavaScript Auth Passkey API: https://supabase.com/docs/reference/javascript/auth-passkey

A funcionalidade é experimental e requer `@supabase/supabase-js` 2.105.0 ou posterior. O MonitorIA já utiliza 2.110.9.

## Supabase MFA

- Visão geral: https://supabase.com/docs/guides/auth/auth-mfa
- TOTP: https://supabase.com/docs/guides/auth/auth-mfa/totp
- challengeAndVerify: https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify

## Auth Hooks

- Auth Hooks: https://supabase.com/docs/guides/auth/auth-hooks
- Custom Access Token Hook: https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook

## Identity linking

- https://supabase.com/docs/guides/auth/auth-identity-linking

## Implementação de referência

- Supabase Auth migration de passkeys:
  https://github.com/supabase/auth/blob/fc654b05e7a02a6a8c375b3a7895bcd563b790ca/migrations/20260302000000_add_passkeys.up.sql
- Supabase JS testes dos métodos passkey:
  https://github.com/supabase/supabase-js/blob/c9bf11d38cd109df1f6ce69d72c1a10dd269c4d7/packages/core/auth-js/test/passkey.methods.test.ts
