# MonitorIA v0.3

Sua câmera vê. A IA lembra.

Esta versão transforma a fundação visual da v0.2 em uma aplicação autenticada e ligada ao Supabase real.

## Entregue nesta versão

- autenticação SSR com Supabase e cookies;
- login por e-mail/senha;
- criação de conta;
- link mágico;
- recuperação e redefinição de senha;
- proteção de `/dashboard`, `/onboarding` e `/reset-password`;
- onboarding de empresa e primeiro local;
- organização, proprietário e retenção criados automaticamente pelo banco;
- dashboard com contagens reais de câmeras, agentes, eventos e COGS;
- linha do tempo lendo a tabela `events`;
- endpoint público `/api/health`;
- endpoint autenticado `/api/health/deep`;
- arquitetura visual continua usando `gpt-5-mini` configurado por variável;
- privilégios do Data API reduzidos ao mínimo necessário;
- plano e propriedade da organização protegidos contra alteração direta pelo navegador.

## Instalação

```bash
npm install
cp .env.example .env.local
npm run dev
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

## Variáveis obrigatórias

```env
NEXT_PUBLIC_APP_URL=https://monitoria.bigcorps.com.br
NEXT_PUBLIC_SUPABASE_URL=https://xwejfayeackbrilipgrj.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
OPENAI_API_KEY=...
GROQ_API_KEY=...
VISION_MODEL=gpt-5-mini
COST_USD_TO_BRL=6
```

`SUPABASE_SERVICE_ROLE_KEY` permanece reservada para os futuros endpoints do Agent. A autenticação e o dashboard desta versão usam a chave publicável com RLS.

## Configuração obrigatória no Supabase Auth

No painel do projeto MonitorIA:

1. Authentication → URL Configuration
2. Site URL: `https://monitoria.bigcorps.com.br`
3. Redirect URLs:
   - `https://monitoria.bigcorps.com.br/auth/callback`
   - `https://monitoria.bigcorps.com.br/auth/confirm`
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/confirm`

Para o fluxo SSR por `token_hash`, configure os modelos de e-mail:

### Confirm signup

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding">Confirmar e-mail</a>
```

### Magic link

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard">Entrar no MonitorIA</a>
```

### Reset password

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password">Redefinir senha</a>
```

A rota `/auth/callback` também foi mantida para links PKCE com parâmetro `code`.

## Testes após o deploy

1. Abra `/login`.
2. Crie uma conta.
3. Confirme o e-mail.
4. Cadastre empresa e local em `/onboarding`.
5. Confira as tabelas `organizations`, `organization_members`, `retention_policies` e `sites`.
6. Abra `/dashboard`.
7. Abra `/api/health/deep` autenticado.
8. Saia e confirme que `/dashboard` redireciona para `/login`.

## Retenção padrão

- frames temporários: 3 dias;
- keyframe do evento: 365 dias;
- metadados: 365 dias;
- vídeo integral: local no cliente.

## Próxima entrega

Cadastro de câmera, perfil inicial, zonas e código temporário de pareamento do Agent.
