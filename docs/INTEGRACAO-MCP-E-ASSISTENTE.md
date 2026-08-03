# Integração com Assistente e MCP

## Assistente MonitorIA

A INT-4 adiciona a intenção interna:

```text
routines_deviations
```

Ela atende perguntas como:

- Qual é o horário habitual de abertura?
- A loja abriu mais tarde hoje?
- Houve atividade depois do fechamento?
- Quantos atendimentos costumam ocorrer por dia?
- Alguma sessão durou mais que o normal?
- O que ficou fora do padrão esta semana?

A resposta utiliza a RPC:

```text
assistant_routine_deviation_summary
```

## MCP público

Nenhuma das 14 ferramentas públicas é renomeada ou substituída.

Os resultados entram dentro de ferramentas já congeladas:

```text
get_monitoria_capabilities
get_camera_overview
get_operational_summary
compare_periods
search_insights
ask_monitoria
```

As capacidades mudam de:

```text
routines: planned
deviations: planned
```

para:

```text
routines: available
deviations: available
```

## Evidências

Quando um desvio deriva de eventos concretos, são retornados IDs de evidência. Quando deriva de ausência de confirmação ou de uma agregação, a resposta deve explicar que pode não existir um evento individual.

## Contrato congelado

A implementação interna pode melhorar nas próximas fases, mas não deve:

- adicionar parâmetro obrigatório;
- mudar o tipo de um campo existente;
- transformar ferramenta de leitura em escrita;
- alterar autenticação;
- ampliar organização ou câmera sem autorização.
