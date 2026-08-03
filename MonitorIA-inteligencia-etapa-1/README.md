# MonitorIA — Inteligência Etapa 1

Entrega inicial do Motor de Estados Visuais.

Conteúdo:

- contratos completos e arquivos novos em `src/`;
- migration principal e rollback em `supabase/migrations/`;
- instalador com dry-run e backup em `scripts/apply-etapa-1.mjs`;
- restaurador do código em `scripts/restore-etapa-1.mjs`;
- instruções em `docs/APLICACAO.md`;
- comparação em `docs/RELATORIO-COMPARACAO.md`.

Ordem obrigatória:

1. aplicar o SQL principal no Supabase;
2. extrair o pacote em uma pasta separada;
3. executar o instalador com `--dry-run`;
4. executar o instalador sem `--dry-run`;
5. executar `npm run check` e `npm run build`;
6. fazer o deploy.

Exemplo, com a pasta do pacote dentro do repositório:

```bash
node MonitorIA-inteligencia-etapa-1/scripts/apply-etapa-1.mjs --repo . --dry-run
node MonitorIA-inteligencia-etapa-1/scripts/apply-etapa-1.mjs --repo .
```

A migration ativa a funcionalidade somente na câmera `Entrada da Loja`. O Agent não é alterado nesta etapa.
