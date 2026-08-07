# MonitorIA — Controle de IA e margem

## Metas comerciais cadastradas

| Plano | Preço de referência | Teto total de COGS |
|---|---:|---:|
| Essencial | R$ 39,90 | R$ 15,00 |
| Atenta | R$ 79,90 | R$ 28,00 |
| Detalhada | R$ 149,90 | R$ 65,00 |

O teto é de COGS total. O painel mede, nesta fase, principalmente a parcela conhecida de IA. Storage, egress, pagamento, impostos, suporte e outros custos devem ser adicionados em fases operacionais posteriores.

## Custos separados

```text
production_ai_cost_usd
experimental_ai_cost_usd
estimated_ai_cost_usd
```

Experimentos `ab_candidate` continuam sendo custo real, mas não contaminam a projeção operacional de produção.

## Alertas

### Custo projetado

- atenção quando a IA projetada atinge a porcentagem de aviso do teto total;
- crítico quando alcança ou ultrapassa o teto;
- sem bloqueio automático.

### Escalonamento

Compara a taxa observada de jobs escalonados ao limite comercial do catálogo.

Na Fase 9, a verificação adicional passa por uma reserva atômica antes da
segunda chamada. A reserva respeita simultaneamente:

- o percentual mensal máximo do plano;
- o orçamento acumulado de IA até o dia atual, limitado ao patamar de aviso
  do teto de COGS;
- uma margem de segurança baseada no custo recente das verificações.

A telemetria considera os papéis `verifier` e `escalation`. Registros antigos
gravados como `final` são reconciliados a partir de `model_chain`.

### Integridade

Alerta quando existem jobs concluídos sem quantidade compatível de registros de uso ou quando a taxa de falha é elevada.

## Segurança

Clientes podem continuar lendo somente métricas neutras de uso e armazenamento. Custos, modelos, projeções, latência e margem ficam restritos ao `service_role` e ao painel interno.

## Painel

```text
/dashboard/operations/ai
```

Requer:

```text
MONITORIA_INTERNAL_OPERATOR_EMAILS
```

O acesso é validado no servidor; não depende de uma flag pública.
