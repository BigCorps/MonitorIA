# MonitorIA v0.8.1

## Perfil Inteligente editável

- galeria com até 24 imagens recentes;
- seleção de outro frame do perfil ou de eventos;
- nova análise usando a imagem escolhida;
- campo de orientação operacional para o responsável;
- edição manual da descrição do ambiente;
- edição de objetivos e instruções para ignorar;
- editor visual de zonas por retângulos e controles;
- zonas com pista de papel operacional:
  - funcionários;
  - clientes;
  - entregadores;
  - visitantes;
  - área compartilhada;
  - sem papel esperado;
- cada ajuste cria uma nova versão;
- somente a aprovação troca o perfil ativo;
- a imagem usada por um perfil fica preservada.

## Eventos mais específicos

- novo campo `headline`;
- título separado do tipo técnico;
- prioridade para ações sobre mera presença;
- eventos antigos receberam títulos determinísticos sem nova chamada;
- pessoas novas possuem:
  - `role`;
  - `roleConfidence`;
- papéis são baseados em posição, zona e atividade;
- nenhuma identificação facial ou correlação entre eventos.

## Segmentação por capítulos

O Agent v0.8.1 pode encerrar um capítulo quando:

- há uma breve pausa e a atividade recomeça;
- a região predominante do movimento muda;
- o capítulo alcança o limite próprio do modo;
- o movimento termina normalmente.

Limites iniciais:

| Modo | Mínimo | Máximo |
|---|---:|---:|
| Econômico | 60 s | 240 s |
| Equilibrado | 30 s | 150 s |
| Detalhado | 15 s | 90 s |

Novos motivos:

```text
activity_resumed
activity_region_changed
activity_chapter_limit
```

## Dashboard e exportação

- cards e timeline usam o `headline`;
- tipo técnico continua visível;
- detalhe mostra Funcionário, Cliente, Entregador, Visitante ou
  Papel não determinado;
- Markdown usa título específico;
- JSON passa para schema 1.1;
- pesquisa inclui o título específico.

## Backend

Já aplicado via MCP:

- `camera_zones.person_role_hint`;
- `events.headline`;
- `event_people.role`;
- `event_people.role_confidence`;
- triggers de título e papel;
- perfil draft com pistas de papel;
- RPC de pesquisa retornando `headline`.

As migrations acompanham o ZIP apenas para histórico.
