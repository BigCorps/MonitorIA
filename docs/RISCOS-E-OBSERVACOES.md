# Riscos e observações

## Passkeys ainda são experimentais no Supabase

A integração fica isolada no cliente Supabase e nos componentes de segurança para facilitar futuras atualizações da API.

## RP ID é permanente

As passkeys são vinculadas a `monitoria.cam`. Não altere o RP ID para `www.monitoria.cam` ou para domínio de preview depois que usuários começarem a cadastrar credenciais.

## Auth Hook é crítico

Um erro na função pode impedir emissão e renovação de JWT. Em emergência, desative o hook no Dashboard antes do rollback SQL.

## Recovery permanece disponível

O fluxo de recuperação de senha não é bloqueado pelas preferências cotidianas. Ele funciona como mecanismo de recuperação, não como método principal escolhido pelo usuário.

## Passkey como único acesso

O banco exige duas credenciais. Mesmo assim, mantenha processo administrativo de recuperação e auditoria para troca ou perda de aparelhos.

## Provedores sociais

O pacote autoriza apenas Google. Habilitar outros provedores no Supabase exige atualização explícita do Auth Hook.

## MFA e dados organizacionais

A segunda migration cria policies restritivas de MFA de forma dinâmica. Tabelas criadas posteriormente não recebem essa policy automaticamente; reaplique a migration ou crie a policy equivalente na nova tabela.
