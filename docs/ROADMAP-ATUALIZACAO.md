# Atualização do roadmap de inteligência

## Entrega preparada

```text
INT-4 — Rotinas e desvios operacionais
```

## Dependências

```text
INT-1 Estados visuais
INT-3 Sessões operacionais
INT-3.8 Operational insights, Assistente e MCP
```

## Próxima fase após aplicação e validação

```text
INT-5 — Processos e ações
```

A INT-5 deverá reutilizar:

- `operational_sessions`;
- `operational_session_events`;
- `operational_insights` com `insight_type = process`;
- baselines e desvios quando um processo possuir sequência habitual;
- as 14 ferramentas MCP públicas congeladas.

Não deverá criar um segundo mecanismo de rotina nem novas ferramentas MCP públicas por padrão.
