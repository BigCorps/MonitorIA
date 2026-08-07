# Operação do cron

Endpoint:

```text
GET /api/cron/camera-health
Authorization: Bearer $CRON_SECRET
```

O endpoint `/api/cron/operations` consolida alertas e passagens prováveis entre câmeras a cada cinco minutos. Ele reutiliza a mesma autenticação e não chama modelos de IA.

Periodicidade recomendada: a cada 5 minutos.

O cron não captura imagens. Ele apenas detecta câmeras que deveriam enviar observações e ultrapassaram o intervalo configurado multiplicado por `health_stale_multiplier`.

A recuperação é automática quando novas observações chegam.
