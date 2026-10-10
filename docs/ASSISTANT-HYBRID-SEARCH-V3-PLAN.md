# Pesquisa IA 3.0 — Plano de implementação seguro

Estado-base: `eab74ed0e36103dbbe7f810e35f85b7fbc4cf4ec`. Conferir o estado real de `main` e `AGENTS.md` antes de qualquer alteração.

## Descobertas verificadas (10/10/2026, leitura)

- Supabase MonitorIA: `xwejfayeackbrilipgrj`; PostgreSQL 17.6, pgvector 0.8.2 no schema `extensions`.
- A tabela `public.event_embeddings` já existe (PK `event_id`, `organization_id`, `model`, `dimensions`, `embedding` sem tipmod), mas contém ZERO vetores.
- `events.search_document` não é nulo nos eventos ativos; `events_search_document_idx` GIN está criado.
- Cerca de 4.133 eventos ativos no recorte da auditoria e 4.130 com imagens prontas. Dimensionamento modesto: índice HNSW **não é requisito imediato**.
- `pg_stat_statements` mostra execução de consultas textuais frequentemente perto de 12 ms de média. O gargalo prioritário é relevância/cobertura, não velocidade.
- Busca visual de crianças: 0 eventos com `apparentAgeGroup=child` confirmado. Menções textuais não se tornam confirmação visual.
- `src/assistant/zero-result-recovery.ts` já executa fallback de termos na mesma requisição HTTP em buscas simples; não deve haver um segundo balão no chat.
- O Agent nativo 1.0.3 fica congelado. Não tocar `agent/**`.

## Gate 1 — Proteção de falha técnica (iniciado nesta branch)

A RPC `search_monitoria_events` pode falhar; o helper `searchEvents` tradicional retornava `{rows:[],total:0}` em qualquer erro, confundindo falha com ausência.

Esta branch aplica `throwOnError: true` no motor da Pesquisa IA e na busca de recuperação. Outros consumidores mantêm comportamento legado até avaliação separada. Erros do banco não são exibidos ao usuário; o endpoint já tem tratamento sanitizado.

Exigir testes de sucesso, erro em modo legado, erro em modo estrito e recuperação que não transforma erro em evidência.

## Gate 2 — Indexação semântica (trabalho do Codex)

1. Revisar Skills oficiais `.agents/skills/supabase` e `.agents/skills/supabase-postgres-best-practices`, tabelas atuais, RLS, permissões, retention, direitos de acesso e migrations imutáveis. Não aplicar migrations em produção.
2. Reutilizar `public.event_embeddings` em vez de criar outro banco ou extensão. Decidir o modelo/dimensões só após confirmar a API (ponto de partida: `text-embedding-3-small`, 768 dimensões, com `dimensions` explícito).
3. Definir texto canônico curto do evento (título, resumo, tipo e sinais objetivos úteis), com remoção de informação pessoal e nenhum RTSP, IP, segredo ou imagem bruta. Registrar versão/assinatura do texto para idempotência e atualização quando evento muda.
4. Criar migration NOVA para quaisquer colunas necessárias, controle de versão e índices de escopo. Não reescrever migrations antigas. Segurança: tenant isolation por `organization_id`, RLS, check de MFA existente; nenhuma nova RPC `SECURITY DEFINER` sem guard explícita para organização + `search_path` fixo + `REVOKE` de PUBLIC/anon.
5. Implementar geração assíncrona (fila/batches limitados, retries/backoff, idempotência, métrica e limite de custo), e backfill **desativado por padrão**. Eventos apagados ou vencidos não podem permanecer pesquisáveis.
6. Sem índice HNSW por padrão com ~4 mil eventos; primeiro medir busca exata filtrada por organização/período. Se necessário depois, criar índice parcial por modelo/dimensão, compatível com coluna vector de tipmod variável.

## Gate 3 — Busca híbrida, ranking e evidências (trabalho do Codex)

1. Nova RPC versionada; manter APIs/RPCs existentes em operação. Busca `tsvector` + similaridade `pgvector` e fusão RRF (exemplo oficial: https://supabase.com/docs/guides/ai/hybrid-search).
2. Aplicar SEMPRE filtros de organização, data, câmera, local e visibilidade/revisão **antes** de ranquear; filtros rígidos de zona, tipos, `apparentAgeGroup`, encerramento e trilha de evidências não podem ser alargados pela IA.
3. Validar representação dimensional e modelo idênticos na indexação e na consulta; classificação semântica é PROBABILÍSTICA, não uma classe estruturada.
4. Deduplicar evento e sequência e manter `event_id` real em toda resposta; validar acesso ao hidratar as evidências.
5. Feature flag OFF por padrão; rollout controlado com fallback textual original, limite de tempo e custo, sem segunda mensagem visível nem outra requisição pelo frontend.
6. Não contar top-k da busca vetorial como total de acontecimentos; métricas exatas somente por consulta estruturada que suporte contagem.
7. Instrumentar latência p50/p95, buscas sem cobertura, sem resultado, erros, taxa de recuperação relevante, custo por mensagem, recall@k e precisão; logs sem prompts privados ou dados sensíveis.

## QA e critérios de aceitação

- Corpus sintético multi-tenant e matriz de ao menos 30 perguntas (entregas, crianças/adultos, trajetos, horários, negadores, câmeras, zonas, follow-ups e períodos relativos/completos).
- Testes demonstram: sem vazamento entre organizações; filtros respeitados na busca híbrida e fallback; adolescente não vira criança; menção textual a criança não conta como detecção confirmada; zero não significa ausência de acontecimento se não houve cobertura; RLS/MFA mantidos.
- Experimentos com e sem embeddings, inclusive tabela vazia, OpenAI indisponível, timeouts, deleção, expiração, atualização e reconstrução idempotente.
- Evitar embeddings de dados cuja retenção venceu; dados antigos somente após autorização específica de backfill.
- Nenhuma alteração em produção sem autorização explícita separada para migration/backfill; nenhum merge em `main` sem autorização explícita.
- Executar `npm run check`, `npm test` e um único build de Preview após agrupar alterações; não acionar workflows nativos do Agent.
- Reportar arquivos, SHA, PR, cobertura dos testes, plano de rollback, custos esperados e limitações.

## Entrega dos Gates 2/3 (10/10/2026)

Implementação aditiva nesta mesma branch, com flags OFF e migration **pendente**, sem backfill ou mudança remota. Consulte integralmente [ASSISTANT-HYBRID-SEARCH-V3-VALIDATION.md](ASSISTANT-HYBRID-SEARCH-V3-VALIDATION.md) para contratos implementados, 36 perguntas reproduzíveis, resultados offline, custos, rollback e bloqueios de rollout. Vetores sintéticos não validam a relevância do modelo real; a medição de escala em WASM exige validação nativa antes de ativação. Gate 1 preservado. Nenhum merge/publicação em produção autorizado.

## Gate 4+ (posterior)

- Replanejar operações individuais com zero resultado em perguntas compostas, sem executar dados desnecessários.
- Persistir benchmarks/evals reproduzíveis e revisados; medir falsos positivos antes de reanálise visual seletiva.
- Separar explicitamente match textual, semântico, classificação visual e comprovação por evidência, sem sugerir identidade civil.
