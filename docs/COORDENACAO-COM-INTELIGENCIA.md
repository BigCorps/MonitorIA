# Fase 6 — coordenação com a trilha de inteligência

## Fronteira preservada

A Fase 6 não altera:

```text
src/assistant/contracts.ts
src/assistant/openai.ts
prompts
intenções
planejamento de consultas
evidências
linguagem de incerteza
toolset público do MCP
schemas da inteligência
```

Ela controla exclusivamente:

- disponibilidade comercial;
- reserva;
- consumo;
- estorno/liberação;
- franquia mensal;
- trial;
- pacotes extras;
- Pix;
- expiração;
- interface de saldo.

## Dashboard atual

A rota inteligente existente continua intacta.

A integração acontece por triggers em `assistant_messages`:

```text
BEFORE INSERT da mensagem user
  reserva

AFTER INSERT da mensagem assistant
  conclui e consome

AFTER DELETE da mensagem user ainda reservada
  libera sem consumir
```

Isso evita modificar prompts ou o planner do Assistente.

## MCP futuro

As 14 ferramentas públicas permanecem congeladas.

Ferramentas determinísticas como busca, detalhe, estado ou resumo estruturado não consomem automaticamente.

Somente uma operação de resposta livre que o produto classificar como interação do Assistente deve usar:

```text
reserve_assistant_interaction
complete_assistant_interaction
release_assistant_interaction
```

## Regra para outro agente

Antes de trocar o fluxo de persistência de `assistant_messages`, preserve estes três pontos:

1. a mensagem `user` precisa possuir uma reserva;
2. o consumo acontece somente após persistir a resposta `assistant`;
3. a falha precisa excluir a mensagem incompleta ou liberar a reserva explicitamente.

Não decrementar saldo dentro de prompt, planner, OpenAI provider ou ferramenta MCP.
