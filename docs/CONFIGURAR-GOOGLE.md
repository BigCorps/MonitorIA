# Configurar login Google

## Google Cloud Console

Crie ou edite um OAuth Client do tipo Web Application.

### Authorized JavaScript origins

```text
https://monitoria.cam
```

Adicione também `https://www.monitoria.cam` somente se o domínio `www` estiver realmente ativo.

### Authorized redirect URI

Use exatamente:

```text
https://xwejfayeackbrilipgrj.supabase.co/auth/v1/callback
```

Copie:

- Client ID;
- Client Secret.

## Supabase

Em:

```text
Authentication → Providers → Google
```

- habilite o provedor;
- informe Client ID;
- informe Client Secret;
- salve.

## Comportamento do MonitorIA

- Conta nova pelo Google recebe preferências iniciais com Google permitido.
- Conta já existente pode vincular Google em `Dashboard → Perfil → Segurança`.
- O método Google só pode se tornar o único método depois que a identidade estiver vinculada.
- O Auth Hook rejeita OAuth que não seja Google.

## Atenção

Neste desenho, o único provedor social previsto é Google. Não habilite Facebook ou outro OAuth sem atualizar o hook para identificar e autorizar explicitamente esse provedor.
