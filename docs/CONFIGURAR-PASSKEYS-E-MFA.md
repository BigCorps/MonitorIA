# Configurar Passkeys e MFA

## Passkeys

No Dashboard do Supabase:

```text
Authentication → Passkeys
```

Habilite passkeys e configure:

```text
Relying Party Name
MonitorIA.cam

Relying Party ID
monitoria.cam

Allowed Origin
https://monitoria.cam
```

Adicione `https://www.monitoria.cam` somente quando esse host estiver ativo e fizer parte da aplicação.

O RP ID deve permanecer `monitoria.cam`. Alterá-lo depois invalida o uso das passkeys já cadastradas para o domínio anterior.

O frontend já ativa a flag exigida pelo cliente:

```ts
auth: {
  experimental: {
    passkey: true,
  },
}
```

## Política para passkey como único método

O SQL exige pelo menos duas passkeys quando o usuário tentar deixar somente passkey habilitada.

Exemplo recomendado:

- uma passkey no celular;
- uma passkey no computador ou gerenciador de senhas.

## MFA TOTP

O usuário pode cadastrar TOTP:

- pelo Perfil;
- pela tela `/auth/mfa` quando a política obrigatória for aplicada antes do cadastro.

O fluxo usa:

- `mfa.enroll()`;
- `mfa.challengeAndVerify()`;
- `mfa.listFactors()`;
- `mfa.unenroll()`;
- `mfa.getAuthenticatorAssuranceLevel()`.

Depois da verificação, a sessão recebe `aal2`.

## Políticas disponíveis

### Usuário

Cada usuário pode marcar:

```text
Exigir 2FA na minha conta
```

### Organização

Proprietário ou administrador pode escolher:

```text
optional  = cada usuário decide
admins    = proprietários e administradores
all       = todos os integrantes
```

## Não confundir

Habilitar dois métodos de login não é 2FA. Senha e Google habilitados significam duas alternativas. O 2FA verdadeiro é o primeiro login seguido da verificação TOTP, elevando a sessão para `aal2`.
