# MonitorIA.cam — aplicação da página de perfil

## 1. Copiar os arquivos

Extraia o conteúdo deste pacote na raiz do repositório, preservando as pastas.

O único arquivo existente substituído é:

- `app/dashboard/dashboard-sidebar.tsx`

Os demais são novos.

## 2. Aplicar a migration no Supabase

A migration é:

- `supabase/migrations/20260731172500_create_organization_profiles.sql`

Pelo Supabase CLI:

```bash
npx supabase db push
```

Ou copie o conteúdo da migration para o SQL Editor do projeto e execute uma vez.

## 3. Validar localmente

```bash
npm install
npm run check
npm test
npm run build
```

## 4. Publicar

Faça commit e push. A Vercel fará o deploy automaticamente.

## 5. Testar

Abra:

```text
https://monitoria.cam/dashboard/profile
```

Valide:

1. atualização do nome, telefone e função do usuário;
2. atualização da senha;
3. envio de um novo link mágico;
4. nome e dados comerciais da empresa;
5. nome, endereço e fuso do estabelecimento;
6. permissões: `owner` e `admin` editam a empresa; `operator` e `viewer` não editam.

## Estrutura dos dados

- dados pessoais: `auth.users.raw_user_meta_data`;
- nome e plano da empresa: `public.organizations`;
- dados comerciais: `public.organization_profiles`;
- endereço, nome e fuso do local: `public.sites`;
- nível de acesso: `public.organization_members`.
