# MonitorIA — Pesquisa IA Motor Máximo 2.0

## Arquitetura

A versão 2.0 preserva o princípio de custo baixo da V1 e aumenta o poder de consulta sem acrescentar nova análise visual.

```text
pergunta
→ parser determinístico 2.0
→ 1..6 operações tipadas
→ entidades/período/contexto estruturados
→ RPCs controladas
→ cobertura/evidências
→ resposta determinística
```

Somente quando o parser local não consegue resolver a pergunta existe fallback de planejamento para `gpt-5-nano`. A resposta final não chama LLM.

## O que mudou

- Perguntas compostas viram várias operações na mesma requisição.
- O histórico da conversa passa a reutilizar o QueryPlan estruturado salvo na mensagem anterior.
- Diretório semântico inclui locais, câmeras, zonas, entidades visuais e processos configurados.
- Saúde de câmera foi separada entre estado atual e histórico.
- Passagens entre câmeras podem filtrar origem e destino.
- Nova operação de atenção combina alertas, desvios e incidentes técnicos.
- Toda consulta recebe um estado de cobertura: `VALID_DATA`, `PARTIAL_COVERAGE`, `NO_COVERAGE` ou `STALE_DATA`.
- Pesquisa estruturada pode filtrar zona e atividade após fechamento sem montar SQL a partir do texto do usuário.
- A Pesquisa IA funciona no modo determinístico mesmo se `OPENAI_API_KEY` estiver ausente; apenas perguntas ambíguas perdem o fallback.

## Composição

Exemplo:

> Quantos clientes vieram ontem, qual câmera teve mais movimento e teve algo depois do fechamento?

É decomposto em três operações independentes:

1. COUNT de clientes/visitas prováveis;
2. RANK de câmeras por eventos;
3. consulta de desvios/atividade após fechamento.

Não é necessário mandar a pergunta inteira para um modelo.

## Nano-only

- Pesquisa IA fallback: `gpt-5-nano`.
- Resposta: zero chamadas.
- Visão econômica/balanceada/detailed/strong/verifier/perfil: runtime força `gpt-5-nano`.
- `.env.example` foi limpo para apontar todos os modelos ativos para nano.
- `VISION_MINI_*` permanece apenas como tabela histórica de preços para eventos antigos já gravados com mini.

## Migration aplicada

Supabase: `20261001132607_assistant_motor_maximo_v2`.

RPCs novas:

- `assistant_context_directory_v2`
- `assistant_coverage_summary_v2`
- `assistant_camera_health_history_v2`
- `assistant_cross_camera_journeys_v2`
- `assistant_attention_summary_v2`
- `assistant_structured_event_search_v2`

Todas revogam execução de `PUBLIC`/`anon`, concedem somente a `authenticated`/`service_role` e validam `private.is_org_member` antes de retornar dados.
