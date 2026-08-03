# Aplicação da INT-5

## Dependências obrigatórias

Confirme no banco e no repositório:

```text
INT-3   operational_sessions e operational_session_events
INT-3.8 operational_insights e monitoria_capability_registry
INT-4   camera_behavior_baselines
```

## 1. Aplicar a migration

Execute:

```text
005-operational-process-intelligence-v1.sql
```

A migration cria templates genéricos, mas mantém `process_intelligence_enabled=false` por padrão. Ative por câmera somente depois de revisar a configuração.

Exemplo:

```sql
update public.cameras
set process_intelligence_enabled = true
where id = 'CAMERA_UUID';
```

## 2. Aplicar os arquivos

```bash
node MonitorIA-inteligencia-fase-5/scripts/apply-fase-5.mjs \
  --repo . \
  --dry-run
```

Depois:

```bash
node MonitorIA-inteligencia-fase-5/scripts/apply-fase-5.mjs \
  --repo .
```

## 3. Validar

```bash
npm run check
npm run build
```

## 4. Processar a fila inicial

```text
GET /api/cron/processes?mode=queue&limit=100
Authorization: Bearer CRON_SECRET
```

Para reconstrução controlada:

```text
GET /api/cron/processes?mode=full&limit=500
```

## 5. Agendamento recomendado

- fila: a cada 5 minutos;
- reconstrução completa: uma vez por noite durante homologação;
- após estabilização, reconstrução completa somente sob demanda.

## Rollback

Primeiro remova ou reverta os arquivos. Depois execute:

```text
005-operational-process-intelligence-v1-rollback.sql
```

## Definições personalizadas

A migration inclui a RPC administrativa `save_operational_process_definition_v1`. Ela deve ser chamada apenas por owner/admin autenticado ou por uma futura tela administrativa. O MCP público não possui permissão de execução.
