# MonitorIA v0.7.3

## Parte A — segmentação

- calibração automática com p50, p90 e p95;
- máscara de zonas `ignore`;
- supressão automática de overlays nas bordas;
- máscara explícita por canto;
- quadros consecutivos para abrir e fechar eventos;
- cooldown;
- bloqueio de reabertura após `maximum_duration`;
- agenda semanal;
- retenção de `agent_health` por 7 dias;
- consolidação horária por 365 dias.

## Parte B — telemetria

- registra `cached_tokens`;
- registra `reasoning_tokens`;
- usa `prompt_cache_key`;
- calcula custo descontando entrada em cache;
- registra cadeia de modelos e custo por chamada;
- separa chamadas finais, escalonamentos e A/B.

## Parte C — A/B

- comparação nano × mini controlada por variável;
- máximo por câmera;
- falha experimental não derruba o evento;
- tela `/dashboard/vision-tests`;
- avaliação humana: nano, mini, equivalente ou ambos ruins.

## Parte D — modos reais

- Econômico: 1 quadro, 960 px, nano;
- Equilibrado: até 3 quadros, 960 px, nano com escalonamento;
- Detalhado: até 4 quadros, 1280 px, mini;
- `consolidation_interval_seconds` controla captura de pico;
- configuração editável na página da câmera.

## Banco

A migration está incluída no patch, mas não é aplicada automaticamente pelo
deploy da Vercel.
