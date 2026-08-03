# MonitorIA — Fase 3: Sessões e capítulos operacionais

Esta fase transforma grupos de continuidade da Fase 2 em histórias operacionais completas.

## Entregas

- schema visual `1.4` com `sessionSignals`;
- sessões de atendimento, entrega/retirada, visita, funcionário, equipamento, área restrita, abertura e fechamento;
- capítulos ordenados e participantes prováveis;
- resultado visual e motivo de encerramento;
- nova seção `/dashboard/sessions` com detalhe da história;
- atualização em tempo real das sessões;
- intenção `interaction_sessions` no Assistente;
- badges de sessão nos cards de eventos;
- migration, rollback, instalador e restaurador.

## Dependências

Aplique antes:

1. Fase 1 — Motor de Estados Visuais;
2. Fase 2 — Memória Curta e Continuidade;
3. Etapa 2.5 — Eventos em tempo real, recomendada para manter a experiência consistente.

## Aplicação

Execute primeiro a migration no Supabase:

```text
supabase/migrations/20260801193000_operational_sessions_v1.sql
```

Depois, extraia o pacote na raiz do repositório e execute:

```bash
node MonitorIA-inteligencia-etapa-3/scripts/apply-fase-3.mjs \
  --repo . \
  --dry-run

node MonitorIA-inteligencia-etapa-3/scripts/apply-fase-3.mjs \
  --repo .

npm run check
npm run build
```

O SQL não foi aplicado automaticamente. Os primeiros ajustes de classificação serão feitos com as câmeras em produção, conforme a decisão do projeto.
