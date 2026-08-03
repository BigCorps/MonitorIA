# MonitorIA — correções pós-auditoria das fases 1 a 7

## O que este pacote corrige

1. O `401 unauthorized` interno da Edge Function `monitoria-process-billing`.
2. Os crons ausentes de saúde da câmera, processos, perfis operacionais e rotinas.
3. A divergência de nomes das migrations da Fase 6 e do Realtime.
4. O histórico ausente das migrations de inteligência executadas diretamente no banco.
5. Execução anônima de três RPCs `SECURITY DEFINER` do MCP.
6. Reavaliação de `auth.uid()`/`auth.jwt()` em policies MCP.
7. Policies permissivas duplicadas por uso de `FOR ALL` junto com `FOR SELECT`.
8. Índices ausentes nas chaves estrangeiras das tabelas de inteligência.
9. Atualizações automáticas indeterminadas de Node, fixando `22.x`.

## Ordem segura de aplicação

### 1. Faça backup/branch

Aplique primeiro em uma branch Git. Não execute novamente as migrations antigas.

### 2. Extraia o ZIP sobre a raiz do repositório

Os arquivos `package.json`, `vercel.json` e a Edge Function serão substituídos. A nova migration será adicionada.

### 3. Simule a reconciliação

```powershell
.\scripts\reconcile-migration-history.ps1
```

Revise os nomes exibidos. Depois aplique:

```powershell
.\scripts\reconcile-migration-history.ps1 -Apply
```

O script:

- renomeia as migrations da Fase 6 para as versões já registradas na produção;
- renomeia `enable_events_realtime` para a versão registrada;
- marca como `applied`, sem executar novamente, as nove migrations de inteligência que já existem no schema de produção.

O projeto precisa estar linkado ao Supabase correto:

```powershell
supabase link --project-ref xwejfayeackbrilipgrj
```

### 4. Valide o código

```powershell
npm run check
npm run build
node test/post-audit-fix.test.mjs
```

### 5. Aplique somente a nova migration

Depois da reconciliação:

```powershell
supabase db push --linked
```

A migration nova é:

```text
20260803204000_post_audit_security_performance.sql
```

### 6. Publique a Edge Function corrigida

```powershell
supabase functions deploy monitoria-process-billing --project-ref xwejfayeackbrilipgrj
```

Confirme no painel do Supabase que `Verify JWT` continua habilitado.

### 7. Commit e push

O push no GitHub dispara o deploy da Vercel. O novo `vercel.json` agenda os quatro processadores ausentes.

### 8. Verificação pós-deploy

```powershell
.\scripts\verify-post-audit.ps1
```

Para testar também os endpoints protegidos:

```powershell
.\scripts\verify-post-audit.ps1 -CronSecret "SEU_CRON_SECRET"
```

O segredo é usado apenas em memória pelo PowerShell e não é salvo pelo script.

## Observações importantes

- O pacote não altera produção automaticamente.
- Não rode `supabase db push` antes da reconciliação do histórico.
- A Edge Function só aceita `service_role`; um token `anon` continuará recebendo `401`.
- As tabelas internas com RLS e sem policy permanecem fechadas de propósito.
- O rollback SQL não reabre acesso anônimo às RPCs MCP.
