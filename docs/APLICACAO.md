# Aplicação da INT-4

## 1. Dependências obrigatórias

A migration interrompe com erro explícito quando não encontra:

```text
public.site_operating_sessions
public.operational_sessions
public.operational_insights
public.monitoria_capability_registry
```

Isso significa que INT-1, INT-3 e INT-3.8 precisam estar aplicadas no banco. O instalador também exige os arquivos de INT-3 e INT-3.8 no repositório.

## 2. Banco

Execute uma única vez:

```text
supabase/migrations/20260802190000_routine_intelligence_v1.sql
```

A cópia isolada é:

```text
004-routine-intelligence-v1.sql
```

Não execute o rollback como parte da instalação.

## 3. Código

Na raiz do repositório:

```bash
node MonitorIA-inteligencia-fase-4/scripts/apply-fase-4.mjs \
  --repo . \
  --dry-run
```

Depois:

```bash
node MonitorIA-inteligencia-fase-4/scripts/apply-fase-4.mjs \
  --repo .
```

O instalador:

- cria backup dos arquivos existentes;
- instala os arquivos completos da fase;
- modifica apenas blocos conhecidos;
- pode ser executado novamente sem duplicar código;
- informa erro se a base esperada tiver mudado.

## 4. Validação

```bash
npm run check
npm run build
```

Depois do deploy, valide:

```text
/dashboard/routines
/api/cron/routines?mode=evaluate
/api/cron/routines?mode=full
```

Os dois endpoints de cron exigem:

```text
Authorization: Bearer <CRON_SECRET>
```

## 5. Agenda recomendada

Avaliação leve, para desvios atuais:

```text
GET /api/cron/routines?mode=evaluate
```

Frequência inicial recomendada: uma vez por hora.

Reconstrução completa de observações, baselines e insights:

```text
GET /api/cron/routines?mode=full
```

Frequência inicial recomendada: uma vez por noite.

Use `limit` e `offset` para processar lotes:

```text
/api/cron/routines?mode=full&limit=100&offset=0
```

## 6. Primeira execução

A migration habilita a rotina apenas em câmeras que já tenham `operational_sessions_enabled = true`.

Uma câmera nova começa em aprendizado. O padrão geral só fica ativo quando atingir `routine_minimum_days`, inicialmente 5 dias. Dados históricos já existentes dentro da janela de 42 dias podem formar o baseline imediatamente.

## 7. Rollback

Primeiro restaure os arquivos usando o caminho de backup exibido pelo instalador:

```bash
node MonitorIA-inteligencia-fase-4/scripts/restore-fase-4.mjs \
  --repo . \
  --backup ../MonitorIA-backup-routine-intelligence-v1-AAAA-MM-DD...
```

Depois, apenas quando a remoção do banco for realmente desejada, execute:

```text
supabase/migrations/rollback_routine_intelligence_v1.sql
```

O rollback remove estruturas da INT-4 e volta as capacidades `routines` e `deviations` para `planned`.

## 8. O que não foi executado ao preparar o pacote

- nenhuma migration foi aplicada no Supabase;
- nenhum arquivo foi alterado no GitHub;
- nenhum deploy foi iniciado;
- nenhum cron foi configurado;
- nenhuma ferramenta MCP pública foi renomeada.
