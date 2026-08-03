# MonitorIA — pacote pós-auditoria

Este ZIP é um overlay para o repositório `BigCorps/MonitorIA` após as fases 1–7.

Leia primeiro:

```text
docs/POS-AUDITORIA-FASES-1-A-7.md
```

Fluxo resumido:

```powershell
.\scripts\reconcile-migration-history.ps1
.\scripts\reconcile-migration-history.ps1 -Apply
npm run check
npm run build
node test/post-audit-fix.test.mjs
supabase db push --linked
supabase functions deploy monitoria-process-billing --project-ref xwejfayeackbrilipgrj
```

Depois faça commit/push para a Vercel publicar `vercel.json` e `package.json`.
