# MonitorIA — Inteligência Etapa 2

Esta entrega adiciona memória visual temporária, agrupamento de capítulos do mesmo atendimento, estimativa de pessoas distintas e perfis operacionais de funcionários.

## Dependência

A Etapa 1 — Motor de Estados Visuais — deve estar aplicada antes desta entrega, tanto no banco quanto no repositório.

## Entregas principais

- aparência estruturada não biométrica por pessoa;
- memória temporária por câmera;
- `interaction_group_id` para agrupar eventos próximos;
- pessoas, clientes e funcionários prováveis;
- dois perfis operacionais iniciais para a câmera `Entrada da Loja`;
- badges de `cliente provável` e `capítulos` nos cards;
- intenção `continuity_summary` no Assistente MonitorIA;
- SQL de rollback e restaurador do código.

## Aplicação rápida

1. Execute `supabase/migrations/20260801131500_short_memory_continuity_v1.sql`.
2. Extraia este pacote na raiz do repositório.
3. Execute:

```bash
node MonitorIA-inteligencia-etapa-2/scripts/apply-etapa-2.mjs --repo . --dry-run
node MonitorIA-inteligencia-etapa-2/scripts/apply-etapa-2.mjs --repo .
npm run check
npm run build
```

Leia `docs/APLICACAO.md` antes do deploy.
