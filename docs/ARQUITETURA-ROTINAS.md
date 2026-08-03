# Arquitetura de rotinas e desvios

## Fluxo

```text
Estados visuais INT-1
        +
Sessões operacionais INT-3
        ↓
Observações normalizadas por câmera e data local
        ↓
Baselines p10 / p50 / p90
        ↓
Expectativas gerais e por dia da semana
        ↓
Comparação determinística
        ↓
Desvios + evidências
        ↓
Dashboard, Assistente, MCP e alertas futuros
```

## Observações produzidas

```text
operating_open_minute
operating_close_minute
operating_duration_minutes
first_activity_delay_minutes
last_activity_lead_minutes
daily_session_count
hourly_session_count
session_duration_seconds
after_close_event_count
```

Cada observação registra:

- organização, local e câmera;
- data local e dia da semana;
- valor e unidade;
- intervalo de origem;
- IDs de eventos usados como evidência;
- confiança;
- metadados da fonte.

## Baselines

O baseline não representa uma regra universal. Ele representa a distribuição observada dentro da janela configurada.

A versão inicial utiliza:

```text
limite inferior = percentil 10
centro          = percentil 50
limite superior = percentil 90
dispersão       = intervalo interquartil
```

São calculados:

- baseline geral da câmera;
- baseline por dia da semana;
- baseline por hora quando a métrica possui `bucket_hour`;
- baseline por tipo de sessão quando aplicável.

## Expectativas

`operational_expectations` separa o padrão calculado da expectativa efetivamente usada na comparação.

Fontes:

```text
learned
user
hybrid
```

Isso permite confirmar ou ajustar uma faixa sem destruir o histórico aprendido.

## Desvios iniciais

```text
opening_early
opening_late
opening_not_observed
closing_early
closing_late
closing_not_observed
first_activity_late
activity_after_closing
session_duration_high
activity_volume_low
activity_volume_high
```

Um desvio não afirma intenção, fraude, crime ou falha. Ele informa apenas que a observação ficou fora da faixa histórica disponível.

## Dois modos de cron

### `evaluate`

Compara o estado atual com expectativas já calculadas. É adequado para execução frequente.

### `full`

Reconstrói a janela de observações, recalcula baselines, atualiza insights e avalia desvios. É adequado para execução noturna ou após uma correção histórica.

## Concorrência e repetição

- funções por câmera usam advisory locks;
- observações possuem chave de deduplicação;
- baselines e expectativas usam `ON CONFLICT`;
- desvios possuem chave estável por câmera, data e ocorrência;
- insights são atualizados, não duplicados;
- os crons aceitam lote e offset.
