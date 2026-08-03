# Ordem de aplicação em produção

Siga esta ordem para evitar indisponibilidade ou bloqueio de conta.

## 1. Faça backup

- Faça download das migrations atuais do Supabase.
- Salve uma cópia do branch atual do GitHub.
- Não exclua a forma de login atual antes de validar a nova sessão.

## 2. Execute a migration principal

No projeto Supabase MonitorIA (`xwejfayeackbrilipgrj`), abra o SQL Editor e execute:

```text
backend/migrations/20260801170500_auth_preferences_and_mfa.sql
```

Ela cria:

- preferências privadas de autenticação por usuário;
- políticas privadas de MFA por organização;
- auditoria de alterações de segurança;
- RPCs do Perfil;
- Custom Access Token Hook;
- valores iniciais seguros para usuários existentes.

Os padrões iniciais preservam o acesso existente:

- Magic Link habilitado;
- senha habilitada quando já estiver cadastrada;
- Google habilitado quando já houver identidade Google;
- passkey habilitada quando já houver credencial nativa.

## 3. Configure Google, Passkeys e MFA no Dashboard

Siga:

- `docs/CONFIGURAR-GOOGLE.md`
- `docs/CONFIGURAR-PASSKEYS-E-MFA.md`
- `docs/CONFIGURAR-SUPABASE-PRODUCAO.md`

## 4. Habilite o Auth Hook

No Supabase:

```text
Authentication → Hooks → Custom Access Token
```

Selecione a função PostgreSQL:

```text
public.custom_access_token_hook
```

O hook passa a:

- rejeitar senha, Magic Link, Google ou passkey quando o método estiver desativado pelo usuário;
- adicionar `mfa_required` ao JWT;
- adicionar `login_method` ao JWT.

## 5. Aplique o frontend

Na máquina onde está o repositório:

```bash
./apply-frontend.sh /caminho/para/MonitorIA
```

Depois:

```bash
cd /caminho/para/MonitorIA
npm ci
npm run check
npm test
npm run build
```

## 6. Publique na Vercel

Confirme as variáveis:

```text
NEXT_PUBLIC_APP_URL=https://monitoria.cam
NEXT_PUBLIC_SUPABASE_URL=https://xwejfayeackbrilipgrj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<chave pública ativa>
```

Publique o commit normalmente.

## 7. Valide no domínio real

Use `docs/VALIDACAO-EM-PRODUCAO.md`.

Mantenha pelo menos uma sessão administrativa já aberta durante essa validação.

## 8. Aplique o enforcement RLS

Depois que o login, o Perfil e a tela `/auth/mfa` estiverem publicados, execute:

```text
backend/migrations/20260801170510_mfa_rls_enforcement.sql
```

Essa migration adiciona uma policy restritiva às tabelas públicas que:

- já possuem RLS;
- possuem `organization_id`;
- já possuem pelo menos uma policy.

Quando MFA não é obrigatório, o comportamento permanece igual. Quando for obrigatório, o JWT deve possuir `aal=aal2`.

## 9. Só depois configure a política da empresa

No Perfil do proprietário/administrador, escolha:

- cada usuário decide;
- exigir de proprietários e administradores;
- exigir de todos.

Usuários ainda sem TOTP serão levados à tela de cadastro do autenticador após o primeiro método de login.
