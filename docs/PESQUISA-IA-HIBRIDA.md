# Pesquisa IA híbrida — MonitorIA

## Objetivo

A Pesquisa IA prioriza a inteligência estruturada que a MonitorIA já produz. A pergunta em português não gera SQL e não dispara nova análise visual.

```text
pergunta
→ normalização local
→ intenção / período / câmera / local
→ QueryPlan tipado
→ RPCs e queries controladas
→ evidências já persistidas
→ resposta determinística
```

Quando o motor local não entende a pergunta com confiança suficiente, existe um único fallback:

```text
pergunta ambígua
→ GPT-5 nano (somente planejamento estruturado)
→ QueryPlan tipado
→ consultas determinísticas
→ resposta local
```

A chamada de OpenAI nunca recebe permissão para criar SQL e não redige a resposta final.

## Quantidade de chamadas

- pergunta reconhecida localmente: **0 chamadas de LLM**;
- pergunta não reconhecida: **até 1 chamada ao `gpt-5-nano`** para resolver o plano;
- resposta final: **0 chamadas de LLM**;
- nova análise de imagem/vídeo: **0**.

Não existe fallback para `mini` nesta camada. Além disso, as rotas de visão, verificação e criação de perfil foram normalizadas para `gpt-5-nano`; uma variável antiga apontando para `mini` não é aceita pelo runtime novo.

## Componentes

### QuestionNormalizer

Normaliza caixa, acentos, pontuação e variações simples de linguagem.

### Intent catalog

O parser usa um catálogo declarativo de regras e pontuações. O roteamento não depende de uma cadeia crescente de `if/else`.

Intents iniciais reaproveitadas do contrato atual:

- `operating_hours`
- `visual_state`
- `continuity_summary`
- `interaction_sessions`
- `interaction_summary`
- `vehicle_continuity`
- `cross_camera_sequence`
- `routine_deviation`
- `staff_activity`
- `queue_analysis`
- `object_history`
- `equipment_history`
- `camera_health`
- `daily_operations`
- `period_summary`
- `search_events`
- `compare_periods`
- `general_help`

### PeriodResolver

Resolve deterministicamente hoje, ontem, anteontem, esta semana, semana passada, este mês, mês passado, últimos N dias e datas explícitas.

O timezone continua vindo do local da organização.

### EntityResolver

Só recebe o diretório de sites/câmeras que o endpoint já carregou para a organização autenticada. Não existe resolução de organização a partir da frase.

Filtros escolhidos na interface têm prioridade.

### Contexto

Perguntas curtas como `E ontem?` reutilizam a intenção anterior e trocam apenas o período quando possível. O contexto usado é a conversa da thread atual, que já é validada por organização + usuário.

### QueryPlanner

O resultado é sempre `AssistantPlanSchema`. A aplicação continua revalidando `siteId` e `cameraId` contra os IDs permitidos antes de consultar o banco.

## Diretivas controladas de pesquisa

A migration acrescenta duas diretivas internas à RPC `search_monitoria_events`:

### `@time=HH:MM-HH:MM`

Filtra pela hora local do `site.timezone`. Permite:

> Mostre os eventos da câmera Estoque entre 14h e 16h.

O intervalo de data continua sendo parametrizado separadamente.

### `@important`

Aplica uma regra determinística de relevância baseada em:

- evento que exige revisão;
- tipos de atenção conhecidos;
- evidência de alerta inteligente aberto/reconhecido;
- evidência de desvio operacional ativo.

A frase do usuário continua sem poder criar SQL.

## Evidência e linguagem

A resposta local deve preservar as categorias conceituais:

- fato observado;
- cálculo;
- desvio estatístico;
- inferência limitada;
- ausência de dados.

Exemplos seguros:

> Foram registrados 17 eventos por 3 câmeras hoje.

> A câmera Estoque apresentou baixa luminosidade em 7 observações consecutivas.

> Há uma passagem provável entre câmeras. Isso não confirma identidade.

Nunca converter:

- desvio em acusação;
- objeto removido em furto;
- atividade após horário em comportamento escondido;
- passagem provável em identificação de pessoa;
- ausência de observação em prova de ausência.

## Tenant isolation

A mudança mantém múltiplas barreiras:

1. organização vem da sessão autenticada;
2. diretório do parser já nasce filtrado pela organização;
3. câmera/local planejados são validados novamente no endpoint;
4. RPCs recebem `p_organization_id` parametrizado;
5. funções verificam `private.is_org_member(...)`;
6. joins adicionados também validam `organization_id`;
7. evidências continuam hidratadas com filtro explícito de organização.

## local_recording

Gravações históricas não são tratadas como câmera ao vivo. O parser local rebaixa intents de saúde atual/cross-camera quando a fonte selecionada é `local_recording`.

## Agregações adicionadas

`assistant_period_summary` passa a expor, sem remover campos existentes:

- `byCamera`
- `bySite`

Isso permite responder rankings sem carregar a tabela inteira de eventos no servidor.

`assistant_camera_health_summary_v1` passa a expor também:

- `consecutive_count`
- `first_observed_at`
- `reasons`
- `site_name`

`assistant_routine_deviation_summary` passa a incluir nomes de câmera/local ao lado dos IDs já existentes.

## Custos

A V1 não adiciona cron e não adiciona nova análise visual. O custo incremental é leitura/RPC no Supabase e execução curta no backend. As perguntas reconhecidas localmente deixam de consumir tokens do Assistente.

O fallback é deliberadamente raro e usa apenas `gpt-5-nano`.


## Política nano-only

A atualização também fecha os caminhos de visão que ainda podiam selecionar `mini`:

- análise econômica: nano;
- análise balanceada: nano;
- análise detailed/strong: nano;
- verificação/escalonamento: nano;
- perfil inicial da câmera: nano;
- validação/A-B de novas análises: nano.

As variáveis de preço `VISION_MINI_*` permanecem somente para leitura/relatórios históricos de eventos antigos que já tenham sido processados com mini.

## Banco aplicado

A migration desta entrega já foi aplicada via MCP no projeto MonitorIA e registrada no histórico como `20261001125004_hybrid_natural_search_v1`. O arquivo permanece no ZIP/repositório para manter o histórico de migrations sincronizado.

## Escopo comercial

Esta entrega não cria um plano chamado `VIP`, porque esse plano ainda não existe no schema comercial atual. O motor foi preparado para reduzir o custo por consulta e pode ser ligado ao entitlement do VIP quando o catálogo comercial desse plano for implementado, sem reescrever a Pesquisa IA.
