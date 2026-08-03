# Coordenação da Fase 5 com a trilha de inteligência

## Fonte de verdade

Esta fase foi desenhada a partir de:

```text
docs/PLANO-INTELIGENCIA-INTEGRADO-AO-PLANO-PRODUCAO.md
```

## O que a Fase 5 implementa

- agregação de uso por dia, mês, câmera e organização;
- separação entre custo de produção e experimentos A/B;
- projeção de custo por ritmo observado;
- metas comerciais de COGS versionadas;
- comparação de custo conhecido de IA contra o teto total de COGS;
- alertas de custo, escalonamento e integridade da telemetria;
- painel interno protegido por lista de operadores;
- cron idempotente;
- proteção dos campos financeiros contra leitura de clientes.

## O que esta fase não implementa

- score de complexidade;
- escolha da rota;
- troca de modelo;
- verificador visual;
- alteração de prompts;
- alteração dos schemas de visão;
- seleção de frames;
- modos de câmera;
- gateway de inferência;
- criação de `analysis_routing_decisions`.

Esses itens permanecem sob governança da INT-3.5, INT-8 e INT-9.

## Contrato de integração futura

Quando a INT-3.5 for aplicada, ela deverá continuar registrando a decisão na estrutura de inteligência e atualizar o rollup comercial de forma aditiva.

A integração recomendada é:

```text
analysis_routing_decisions
→ agregação por câmera/mês
→ camera_usage_monthly.routing_telemetry_available = true
→ painel de custos exibe rota e motivo reais
```

Não substituir:

```text
refresh_monitoria_ai_usage_daily
refresh_monitoria_ai_usage_monthly
refresh_monitoria_ai_usage_organization
refresh_monitoria_ai_usage_rollups
```

A inteligência pode enriquecer esses rollups, mas não deve criar um segundo painel financeiro ou um segundo teto comercial.

## Limite comercial versus decisão visual

`camera_plan_catalog.maximum_escalation_percent` é um limite comercial.

Ele não define quais eventos são complexos. O gateway da inteligência decide quais eventos merecem rota forte ou verificador e deve operar dentro desse limite, com fallback e telemetria.

## Projeção

A projeção usa:

```text
custo de produção observado
÷ horas entre primeiro e último evento observado
× 720 horas
```

Ela exige uma amostra mínima configurável de jobs e horas.

O resultado é um sinal de risco, não uma cobrança e não uma ordem automática para degradar qualidade.
