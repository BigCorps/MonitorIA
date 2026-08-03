# Operação do cron de processos

## Fila

```text
/api/cron/processes?mode=queue
```

Processa sessões enfileiradas por triggers. É o modo normal de produção.

## Reconstrução

```text
/api/cron/processes?mode=full
```

Reprocessa sessões recentes selecionadas pela função SQL. Use em homologação, mudança de template ou correção de regra.

## Segurança

- exige `Authorization: Bearer CRON_SECRET`;
- utiliza `service_role` somente no servidor;
- nunca exponha o segredo em URL, SQL ou frontend;
- logs não devem incluir imagens, tokens ou RTSP.

## Falhas

A fila usa backoff e preserva `last_error`. Uma falha não remove a sessão nem os eventos originais.
