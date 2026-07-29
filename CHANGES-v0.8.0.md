# MonitorIA v0.8.0

## Eventos

- página `/dashboard/events`;
- filtros por período, local, câmera, tipo e revisão;
- thumbnails reais dos eventos;
- paginação;
- página individual do evento;
- quadros de início, pico, fim e intermediário;
- observações temporais;
- pessoas, veículos, objetos e tags;
- métricas locais, modelo, latência e custo;
- avaliação humana;
- histórico imutável de revisões;
- exclusão lógica auditada.

## Pesquisa

- página `/dashboard/search`;
- pesquisa textual em português;
- busca em resumo, observações, pessoas, roupas, objetos,
  veículos e tags;
- filtros por confiança, presença de pessoas e veículos;
- comparação determinística entre dois períodos;
- exportação e cópia em Markdown;
- exportação e cópia em JSON;
- pesquisa e comparação sem consumo de Assistente IA.

## Câmeras

- o card passa a usar o frame do perfil inteligente;
- fallback para o frame mais recente;
- logo do MonitorIA apenas quando não houver imagem;
- nomes dos modos atualizados para Econômico, Equilibrado e
  Detalhado.

## Backend

Aplicado via MCP:

- `events.search_document` com índice GIN;
- RPC `search_monitoria_events`;
- RPC `compare_monitoria_periods`;
- tabela `event_reviews`;
- RPC `review_monitoria_event`;
- RPC `soft_delete_monitoria_event`;
- trilha de auditoria.

O Assistente IA não faz parte desta versão.
