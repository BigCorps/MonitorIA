# Alterações da v0.3

- Supabase Auth com SSR/cookies e renovação de sessão pelo `proxy.ts`.
- Login por senha, criação de conta, link mágico e recuperação de senha.
- Rotas `/dashboard`, `/onboarding` e `/reset-password` protegidas.
- Criação da organização e do primeiro local usando RLS.
- Dashboard com contagens e eventos reais do Supabase.
- Endpoint autenticado `/api/health/deep`.
- Migrations `20260728153925_restrict_data_api_privileges.sql` e `20260728154130_protect_organization_billing_fields.sql` para privilégios mínimos e proteção dos campos comerciais.

## Depois de copiar para o repositório

1. Faça commit e push em `main`.
2. Configure URLs e modelos de e-mail em Supabase Auth conforme o `README.md`.
3. Confirme `NEXT_PUBLIC_APP_URL=https://monitoria.bigcorps.com.br` na Vercel.
4. Abra `/login`, crie uma conta e complete `/onboarding`.
