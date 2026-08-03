# Operação do cron

## Fila normal

```text
GET /api/cron/staff-profiles?mode=queue
Authorization: Bearer CRON_SECRET
```

Frequência inicial: a cada 5 minutos.

## Reconstrução

```text
GET /api/cron/staff-profiles?mode=full
Authorization: Bearer CRON_SECRET
```

Usar diariamente durante homologação e depois somente para reconciliação ou correção.

## Configuração

```env
STAFF_PROFILE_CRON_BATCH_SIZE=100
```

A inteligência começa desativada por câmera. Habilite somente depois de revisar os perfis existentes e os limites de privacidade.
