# Validação no ambiente real

Esta lista não cria ambiente de teste. Ela serve para validar a implantação diretamente em `monitoria.cam`.

Mantenha uma sessão de proprietário aberta em outro navegador durante os primeiros passos.

## Antes de exigir MFA

1. Entre por senha.
2. Entre por Magic Link.
3. Entre com Google.
4. No Perfil, vincule o Google de uma conta criada por e-mail.
5. Cadastre uma passkey.
6. Saia e entre com a passkey.
7. Cadastre uma segunda passkey.
8. Renomeie e remova uma passkey não essencial.

## Preferências de acesso

1. Desative um método mantendo outro ativo.
2. Saia.
3. Confirme que o método desativado é rejeitado.
4. Confirme que o método autorizado continua funcionando.
5. Confirme que não é possível salvar zero métodos.
6. Confirme que passkey não pode ficar sozinha com apenas uma credencial.

## MFA individual

1. Cadastre um autenticador TOTP.
2. Ative “Exigir 2FA na minha conta”.
3. Saia.
4. Entre com o primeiro método.
5. Confirme o redirecionamento para `/auth/mfa`.
6. Informe o TOTP e confirme acesso ao dashboard.

## MFA da organização

1. Como proprietário, selecione “Proprietários e administradores”.
2. Confirme o desafio TOTP para administradores.
3. Depois, quando desejado, selecione “Todos”.
4. Em uma conta sem TOTP, confirme que `/auth/mfa` oferece o cadastro antes de liberar o painel.

## Sessão e RLS

1. Com MFA obrigatório e sessão AAL1, confirme bloqueio do dashboard.
2. Com MFA obrigatório e sessão AAL1, confirme que consultas organizacionais comuns falham pela policy restritiva.
3. Após TOTP e AAL2, confirme que as consultas voltam a funcionar.

## Build

Antes do deploy, confirme:

```bash
npm ci
npm run check
npm test
npm run build
```
