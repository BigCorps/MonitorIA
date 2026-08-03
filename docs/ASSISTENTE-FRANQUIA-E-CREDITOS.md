# Assistente MonitorIA — franquia, reservas e créditos

## Contrato comercial

### Assinatura paga

```text
90 interações por organização a cada período mensal
```

- saldo compartilhado entre usuários da organização;
- sem acúmulo da franquia incluída;
- renovação junto ao ciclo da assinatura;
- franquia incluída sempre é consumida antes dos pacotes.

### Trial

```text
21 interações por organização durante o trial
```

A Fase 3 cria a allowance de trial. A Fase 6 aplica a mesma reserva e conclusão usada na assinatura.

### Pacotes extras

| Pacote | Valor | Validade |
|---|---:|---:|
| 100 interações | R$ 19,90 | 365 dias |
| 500 interações | R$ 59,90 | 365 dias |
| 2.000 interações | R$ 149,90 | 365 dias |

Pacotes são consumidos pelo vencimento mais próximo.

## O que consome

Consome uma interação:

```text
resposta livre concluída com sucesso pelo Assistente
```

Não consome:

- abrir um evento;
- navegar pelo histórico;
- aplicar filtros;
- consultar gráfico estruturado;
- exportar dados;
- usar ferramenta MCP determinística sem resposta livre;
- tentativa que falha antes da resposta.

## Reserva transacional

O fluxo do dashboard é:

```text
mensagem do usuário
→ reserva por 10 minutos
→ resposta da IA
→ mensagem do Assistente persistida
→ consumo atômico
```

Se a resposta falhar:

```text
mensagem do usuário removida
→ reserva liberada
→ nenhum débito
```

A reserva evita duas perguntas simultâneas usarem o último crédito disponível.

## Prioridade de consumo

```text
1. trial ou franquia mensal incluída
2. pacote extra com vencimento mais próximo
```

## Entitlement

Pacote extra não substitui uma assinatura.

O Assistente funciona quando houver:

- acesso legado interno; ou
- trial em captura ou exploração; ou
- assinatura ativa; ou
- período de tolerância válido; ou
- allowance manual de suporte.

Quando a assinatura estiver suspensa:

- o Assistente é bloqueado;
- pacotes extras permanecem guardados;
- o vencimento dos pacotes continua correndo;
- a retomada ocorre sem recriar os pacotes.

## Idempotência

Cada pergunta usa uma chave única:

```text
assistant-message:{messageId}
```

Outros canais devem fornecer uma `request_key` estável.

Uma chave já concluída retorna o mesmo consumo, sem débito duplicado.

## Tabelas reutilizadas

```text
assistant_allowances
assistant_usage_events
assistant_credit_purchases
assistant_credit_ledger
addon_catalog
billing_invoices
billing_invoice_items
billing_pix_payments
```

Nenhum segundo sistema de créditos foi criado.

## Contratos para backend e MCP

Somente `service_role` pode executar:

```text
reserve_assistant_interaction
complete_assistant_interaction
release_assistant_interaction
record_assistant_interaction
process_assistant_commercial_state
```

Uso recomendado para resposta livre em canal futuro:

```text
reserve_assistant_interaction
→ executar a inteligência
→ persistir a resposta
→ complete_assistant_interaction
```

Em falha:

```text
release_assistant_interaction
```

Para um fluxo que só registra depois de uma resposta já concluída:

```text
record_assistant_interaction
```

Ferramentas estruturadas do MCP não devem chamar esses contratos por padrão.
