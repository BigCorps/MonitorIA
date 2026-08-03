# Operação dos crons de rotina

## Endpoint

```text
GET /api/cron/routines
```

Autorização:

```text
Authorization: Bearer <CRON_SECRET>
```

## Avaliação frequente

```text
/api/cron/routines?mode=evaluate&limit=100&offset=0
```

Executa apenas a comparação com expectativas existentes.

Uso recomendado: a cada hora.

## Atualização completa

```text
/api/cron/routines?mode=full&limit=100&offset=0
```

Reconstrói:

- observações da janela;
- baselines;
- expectativas aprendidas;
- insights de rotina;
- desvios.

Uso recomendado: uma vez por noite.

## Processamento em lotes

Para mais de 100 câmeras, use offsets sucessivos:

```text
offset=0
offset=100
offset=200
```

A resposta informa câmeras processadas, falhas e IDs afetados.

## Falhas

Uma falha em uma câmera não interrompe as demais do lote. O resultado agrega:

```text
processed
failed
failures
```

A reconstrução completa também registra `routine_refresh_runs` por câmera.
