# Configuração do Supabase em produção

Projeto:

```text
MonitorIA
Project ref: xwejfayeackbrilipgrj
```

## URL Configuration

Em:

```text
Authentication → URL Configuration
```

Configure:

```text
Site URL
https://monitoria.cam
```

Adicione em Redirect URLs:

```text
https://monitoria.cam/auth/callback
```

Adicione também o endereço abaixo somente quando `www.monitoria.cam` estiver configurado e redirecionando corretamente:

```text
https://www.monitoria.cam/auth/callback
```

Não é necessário adicionar localhost para esta implantação direta em produção.

## Custom Access Token Hook

Depois da migration principal:

```text
Authentication → Hooks → Custom Access Token
```

Escolha:

```text
Postgres Function
public.custom_access_token_hook
```

Não habilite uma segunda função para o mesmo hook.

## MFA

Em Authentication, mantenha habilitados:

- TOTP enrollment;
- TOTP challenge;
- TOTP verification.

O frontend usa MFA TOTP nativo e o claim `aal` emitido pelo Supabase.

## Manual identity linking

Habilite a vinculação manual de identidades para que um usuário já autenticado por e-mail possa conectar o Google no Perfil.

A interface usa:

```text
supabase.auth.linkIdentity({ provider: "google" })
```

## Variáveis da Vercel

```text
NEXT_PUBLIC_APP_URL=https://monitoria.cam
NEXT_PUBLIC_SUPABASE_URL=https://xwejfayeackbrilipgrj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key ativa>
```

Não coloque `service_role` nem segredo JWT na Vercel.

## Verificação dos objetos SQL

Depois das migrations, execute:

```text
backend/VERIFY.sql
```
