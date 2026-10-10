# Pesquisa IA 3.0 — Gates 2/3 para revisão

Base: branch `feature/assistant-hybrid-search-v3`, commit inicial `ca4efcefe9f4d122ca32211c71aa4049255645a5`, main observada `eab74ed0e36103dbbe7f810e35f85b7fbc4cf4ec`. Gate 1 preservado. Código dos Gates 2/3 entregue atrás de flags OFF; não equivale a autorização de rollout. PR #4. Agent 1.0.3 e workflows nativos intactos.

## Implementação

Migration pendente: `supabase/migrations/20261010190245_assistant_hybrid_search_v3.sql`, criada com `supabase migration new`. Nenhuma migration existente foi alterada. Nenhuma alteração remota de banco, backfill, configuração, scheduling, variável ou deploy manual foi executada.

### Embeddings

- Reutiliza `public.event_embeddings` e `extensions.vector`, sem instalar nova extensão ou criar HNSW. Modelo `text-embedding-3-small`, dimensão explícita 768, encoding float; valida quantidade, ordenação, modelo, finitude, dimensão e norma não nula da resposta. Contrato confirmado no SDK OpenAI 6.39.0 (`resources/embeddings.d.ts`) e guia oficial Supabase de busca híbrida. A dimensão reduzida ainda precisa de avaliação do modelo real.
- Projeção v1 de título/resumo/tipo efetivo para vocabulário controlado. O texto livre permanece no banco: nenhum nome, email, documento, IP, RTSP, credencial, caminho, UUID ou imagem é enviado pelo novo código. O mesmo vocabulário projeta a intenção da consulta. Termos fora do vocabulário, frases exatas e negação ficam na busca lexical. Uma menção textual a criança não gera classificação visual.
- Hash MD5 da **projeção versionada**, usado somente para idempotência/invalidação, não para autenticação ou anonimização. Alterações que não mudam a projeção não exigem nova chamada. Mudança de fonte efetiva, soft delete e alteração de retenção invalidam derivados. Hard delete usa FK com cascade. Fontes expiradas são excluídas da recuperação imediatamente, mesmo antes da limpeza física.
- Fila privada persistente, leases de 90 s, CAS de lease/hash/tenant/fonte, até 16 itens por lote, no máximo 3 tentativas, backoff exponencial. Worker assíncrono separado da pergunta. Sem retries automáticos do SDK. Sem texto privado ou erro bruto em métricas.
- Teto diário global persistente: 100 mil tokens reservados conservadoramente por bytes UTF-8, serializado pelo banco. Reservas não são devolvidas após falhas incertas; isso inclui retries. Um lote interrompido não reinicia custos ilimitadamente. Status `failed` após esgotar tentativas exige intervenção autorizada; não existe loop infinito.
- Worker exige CRON_SECRET, flag de servidor e controle do banco. O novo endpoint **não está agendado** em `vercel.json`. Migração não popula a fila com eventos antigos. Backfill exige outra opção explícita, organização e período, máximo 100 itens por chamada, além de aprovação operacional separada.

### Recuperação e evidências

- RPC nova `assistant_hybrid_event_search_v3`, `SECURITY INVOKER`, permissões somente `authenticated`; sem acesso anon/service-role/MCP-readonly à nova busca. Membership, grants MCP de JWT e MFA são verificados explicitamente; RLS atual continua aplicada.
- Organização, câmera, local, período semiaberto, zona, tipo efetivo corrigido, idade visual com confiança >=0,60, encerramento confirmado, revisão, confiança, presença de pessoas/veículos e diretivas locais `@time`/`@important` entram **antes** do ranking.
- FTS português + busca exata de cosseno dos vetores elegíveis, RRF k=60. Modelo/dimensão/versão/hash/expiração precisam coincidir. Limiar experimental de distância 0,35, ainda não calibrado com embeddings reais.
- Deduplicação por evento e sessão/grupo de interação, com desempate estável. IDs reais e tipo de match lexical/semantic/hybrid, nunca nova confirmação visual.
- Primeiro probe lexical mede cobertura de embeddings; tabela vazia evita OpenAI. Cache somente na requisição e limite de três consultas distintas por requisição. Falha/timeout do provedor retorna o resultado lexical do mesmo RPC, preservando filtros. Falha de banco não vira zero. RPC ainda não instalada é fallback legado explícito.
- Top-k retorna `total=null`, `totalIsExact=false`, `returnedCount`. Agregações count/rank/first/last/duration continuam no motor determinístico existente, sem “total semântico”. A resposta descreve seleção, não contagem total; ausência de resultado não prova ausência de acontecimento.
- Recuperação composta permanece no executor da mesma requisição, com uma resposta. Nenhuma nova requisição/frontend ou segundo balão. Replanejamento individual de operações permanece Gate 4.
- No caminho v3, hidratação usa cliente autenticado, valida RLS, eventos/ativos não apagados nem expirados, remove evidências que perderam acesso **antes** da resposta/persistência e propaga falhas técnicas sanitizadas. Flag OFF preserva RPCs, coleta de evidências e recuperação atuais.
- Telemetria por operação registra modo, fallback, latência, cobertura, quantidade retornada, tokens e custo incremental sem prompt. O custo incremental de embeddings entra no custo estimado da mensagem/uso. Métricas do lote não incluem cenas ou IDs; sua retenção/dashboards operacionais são responsabilidade do serviço de logs existente.

## Testes reproduzíveis

```bash
npm ci
npm run check
npm test
node --import tsx --test test/assistant-hybrid-v3*.test.ts
node --import tsx scripts/eval-assistant-hybrid-v3.ts work/hybrid-eval.json
```

Dependência **somente de desenvolvimento** `@electric-sql/pglite@0.3.14` pinada no lock: PostgreSQL 17.5/WASM com extensão pgvector, fixture descartável, sem DSN externo. O teste executa a migration nova e a política MFA canônica. O fixture representa dependências relevantes, não reconstitui todo o histórico de migrations do produto. Portanto ainda é necessária uma validação em banco nativo isolado com o schema completo.

Resultado final: `npm run check` aprovado; suíte completa **539 testes aprovados, zero falhas** em Node 22. Revisão independente de segurança aprovada para commit/PR com flags OFF, sem autorizar ativação. `git diff --check` aprovado. Nenhum build nativo ou operação de produção executado. O check/test/build web da PR deve validar o mesmo SHA após o push agrupado.

Cobertura: anon/outsider/AAL1 bloqueados; membro AAL2 e JWT MCP com grant válido; ausência de grant MCP; escrita cross-tenant recusada; zero vetores; dimensões incorretas; modelo legado; atualização idempotente/invalidação; deleção/expiração; leases, CAS e reservas; backfill OFF; outage/timeout do provedor; erro de banco distinto de vazio; flags OFF; filtros idênticos entre probe e busca; contagem inexata; cache isolado; perguntas compostas, período relativo e follow-up do planejador real.

`test/fixtures/assistant-hybrid-v3-matrix.json`: **36 perguntas**, com argumentos estruturados e IDs esperados. Inclui entregas, crianças/adultos/adolescentes, menção textual infantil, objetos, locais, períodos, zonas, revisão, fechamento, compostas, follow-up e período sem cobertura. Essa matriz executa os argumentos de ouro diretamente no RPC; não é um benchmark completo de compreensão de linguagem natural. Testes separados exercitam o planejador/executor, e os testes existentes da Pesquisa IA continuam rodando.

### Experimento offline (Node 22, 10/10/2026)

Vetores one-hot sintéticos de 768 dimensões — **não mede relevância real de text-embedding-3-small**. Não houve chamada paga, prompt real, imagem ou acesso à produção.

| Métrica, 36 recortes de ouro | Lexical | Híbrida sintética |
| --- | ---: | ---: |
| Recall agregado | 78,79% | 100% |
| Precisão | 100% | 100% |
| Casos com conjunto exato | 30/36 | 36/36 |
| Falsos positivos observados | 0 | 0 |
| Recuperações de vazio | 0 | 1 |
| Latência p50 | 12,97 ms | 11,89 ms |
| Latência p95 | 49,43 ms | 34,67 ms |

As diferenças de latência acima são de uma amostra pequena e não provam que o método híbrido seja mais rápido.

Teste de escala: **4.009 vetores ativos**, 768 dimensões, 5 warm-ups + 20 amostras, estatísticas atualizadas (`ANALYZE`), scan exato filtrado, sem ANN. p50 **2.428 ms**, p95 **3.761 ms** em WASM. É um sinal de risco, não uma medição do Supabase de produção. O cliente v3 limita cada RPC a 2 s, o provedor a 1 s; uma consulta que ultrapassa o limite retorna erro técnico sanitizado. O timeout do cliente não substitui limite de execução no pool/API do banco; o `statement_timeout` da função não deve ser considerado garantia de cancelamento do statement externo. Verificar limites do pool/API no ambiente de teste autorizado.

Antes de ativar: medir PostgreSQL nativo/schema completo com organização e períodos reais anonimizados, avaliar plano/latência/carga/RLS, e ajustar consulta/limites se necessário. **Não criar HNSW a partir desta medição WASM.** A escolha RRF segue a referência oficial Supabase; não afirmamos superioridade a modelos aprendidos ou a outra fusão sem avaliação comparativa.

## Custos estimados

Hipótese de tarifa standard: **US$ 0,02 / milhão de tokens** de `text-embedding-3-small`; revalidar preço antes do rollout. Dimensão reduzida economiza armazenamento/scan, não tokens de input.

- Consulta de 60 tokens: US$ 0,0000012; máximo três projeções distintas por requisição: ~US$ 0,0000036 nessa hipótese. O limite defensivo de 1.024 bytes/projeção é um teto conservador de tokens; normalmente a projeção é muito menor.
- 4.133 acontecimentos × 120 tokens hipotéticos: ~US$ 0,00992, sem retries. Isso **não autoriza backfill**.
- Reserva padrão de 100 mil tokens/dia: teto de ~US$ 0,002/dia para o worker, incluindo reservas de retries/falhas. Não inclui chamadas já existentes do planejador/resposta visual, nem custos de infraestrutura.
- 4.133 × 768 × 4 bytes: ~12,1 MiB de floats, antes de overhead/TOAST/índices.
- Custo efetivo dos testes: US$ 0. Nenhuma chave foi criada/escrita nem variável alterada; integração usa o contrato de credenciais de servidor já existente.

## Rollout, rollback e pendências

Flags documentadas, **não configuradas nesta tarefa**:

- `MONITORIA_ASSISTANT_HYBRID_V3_ENABLED=true` + allowlist `MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS` para busca.
- `MONITORIA_ASSISTANT_EMBEDDINGS_V3_ENABLED=true` para endpoint de lotes; controle privado `enabled` permanece false na migration. `backfill_enabled` também false.

Sequência após aprovação específica: schema nativo isolado → migration revisada em ambiente autorizado → corpus anonimizado/relevância real → definir threshold/latência aceitável → pequeno piloto por organização → monitorar qualidade/custo → só então autorizar rollout. Aprovação da PR não autoriza migration/backfill/produção automaticamente.

Rollback operacional: desligar flags de busca/worker e controle de indexação; motor legado continua disponível. Não reescrever/apagar migrations antigas nem desligar RLS. Estruturas novas podem permanecer vazias. Remoção futura de estruturas exige nova migration revisada.

Riscos restantes: vocabulário projetado perde cores/objetos não mapeados/nuances, threshold e modelo real ainda não avaliados, p95 WASM alto, fixture parcial, ausência de teste de concorrência com múltiplas conexões nativas, aprovação de scheduling e controle de banco pendente, ranking/retorno truncado não equivale a total, e atenção a retenção/acesso que muda durante requisições. A policy restritiva de leitura direta passa a excluir vetores legados/stale; a auditoria inicial informou tabela vazia, mas esse fato deve ser revalidado na aplicação autorizada da migration.

Referências oficiais: [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings).
