# MonitorIA v0.7.0

## Monitoramento contínuo

- mantém uma conexão FFmpeg local em 160 × 90 e escala de cinza;
- calcula movimento pela porcentagem de pixels alterados;
- usa os limites configurados na câmera;
- abre, mantém e fecha eventos localmente;
- captura JPEGs completos apenas no início, pico e encerramento;
- mantém fila em memória de até 10 eventos;
- envia sequencialmente com até três tentativas;
- informa a fila pendente no heartbeat;
- preserva a URL RTSP exclusivamente no Windows Agent.

## Análise no servidor

- novo endpoint `/api/agent/cameras/:cameraId/events`;
- idempotência por câmera e UUID local do evento;
- usa somente o perfil ativo e suas zonas;
- remove IDs de zonas inventados pela IA;
- registra `analysis_jobs`, tokens, custo, latência e response ID;
- cria eventos, pessoas, veículos e sugestões de placa;
- quadros relevantes usam o bucket privado `event-keyframes`;
- `no_relevant_change` não aparece na timeline;
- finalização de evento em função SQL atômica.

## Sessões

- inicia uma `capture_session` por câmera monitorada;
- encerra a sessão ao fechar o Agent ou alterar a configuração;
- contabiliza quadros observados e eventos criados.

## OpenAI

- análise de eventos usa raciocínio mínimo;
- piso de 3.000 tokens de saída;
- uma repetição automática com pelo menos 6.000 tokens quando necessário.

## Banco

A migration `continuous_event_analysis` foi aplicada no Supabase.

A tentativa de teste transacional pela ferramenta foi bloqueada pela camada de
segurança antes da execução. O patch inclui testes TypeScript e o workflow
valida o executável, DPAPI e cálculo de movimento.
