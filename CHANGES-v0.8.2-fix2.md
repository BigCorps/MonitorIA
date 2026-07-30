# MonitorIA v0.8.2 — correção 2

## Gráficos no Assistente

- pedidos explícitos de gráfico agora geram uma visualização real;
- gráficos SVG responsivos, sem dependência externa;
- suporte inicial a barras e linhas;
- movimento por hora;
- uma linha por dia em períodos de até sete dias;
- comparação entre dois períodos;
- aparições por papel operacional;
- categorias de evento;
- panorama de indicadores;
- botão para baixar o gráfico em SVG;
- números do gráfico são montados deterministicamente com os dados do
  Supabase, não inventados pelo modelo.

## Histórico recolhível

- conversas recentes ficam fechadas por padrão;
- botão “Conversas” abre o painel sobre o chat;
- o painel não reduz mais a largura do Assistente;
- fecha ao clicar fora, escolher uma conversa, iniciar nova pesquisa ou
  pressionar Esc;
- funcionamento equivalente no desktop e mobile.

## Rolagem

- barra do chat com tema claro;
- trilho branco;
- indicador cinza-claro, fino e arredondado;
- mesmo tratamento para o histórico de conversas.

## Período, câmera e local na pergunta

O planejador foi reforçado para reconhecer diretamente frases como:

```text
Mostre as entregas de ontem na câmera Entrada da Loja.
Compare esta câmera hoje com ontem.
Gere um gráfico do movimento da Casa Verde entre segunda e quarta.
```

Filtros preenchidos na interface continuam tendo prioridade. Quando estão
vazios, período, câmera e local são extraídos da pergunta e da conversa
recente.

## Backend

A migration `assistant_day_hour_charts_v082` já foi aplicada via MCP. Ela
adiciona `byDayHour` ao resumo do Assistente, permitindo séries separadas
por dia e hora.
