# MonitorIA — copiar evidência para revisão (v3)

A v3 não importa nenhum pacote do projeto.

Usa somente recursos nativos do Node 22:

```text
fetch
process.loadEnvFile
node:crypto
```

## Segurança obrigatória

Se a `SUPABASE_SERVICE_ROLE_KEY` apareceu em print, chat, log ou commit, rotacione
a chave no Supabase antes de usar este script.

## Diagnóstico

```bash
node MonitorIA-copy-review-evidence-v3/scripts/diagnose-env.mjs
```

O resultado esperado:

```json
{
  "supabase_url_loaded": true,
  "service_role_loaded": true
}
```

A chave não é exibida.

## Copiar

```bash
node MonitorIA-copy-review-evidence-v3/scripts/copy-review-evidence.mjs
```

## Remover depois da revisão

```bash
node MonitorIA-copy-review-evidence-v3/scripts/remove-review-evidence.mjs
```
