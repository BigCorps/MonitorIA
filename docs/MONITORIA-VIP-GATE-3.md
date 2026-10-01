# MonitorIA VIP — Gate 3

## Objetivo

Transformar o trial assistido já existente em uma demonstração VIP acompanhada, sem criar um segundo motor de trial e sem alterar o Agent.

## Fonte única de tempo

O Gate 3 não cria cronômetro paralelo. A fonte de verdade continua sendo:

- `trial_runs.capture_started_at`
- `trial_runs.capture_ends_at`

O cliente e o vendedor renderizam o mesmo `capture_ends_at`. O início usa a RPC existente `start_sales_monitoria_trial`, que revalida readiness imediatamente antes de começar.

## Experiência do cliente

Dentro de `/vip/onboarding`:

1. câmeras selecionadas e prontas;
2. confirmação explícita para iniciar;
3. 60 minutos começam;
4. métricas são atualizadas automaticamente;
5. Pesquisa IA fica disponível no próprio onboarding;
6. ao terminar, novas capturas param, mas os dados do piloto continuam pesquisáveis durante o período de exploração.

A Pesquisa IA usa o endpoint existente `/api/assistant/query` e a franquia do próprio trial. Não existe saldo VIP paralelo.

## Experiência do vendedor

A rota comercial de resultados passa a reconhecer projetos VIP e mostra:

- o mesmo relógio do cliente;
- câmeras online;
- Agents online distintos;
- acontecimentos consolidados;
- consumo da franquia da Pesquisa IA;
- situação individual das câmeras.

O vendedor não recebe interface para perguntar em nome do cliente e não vê credenciais RTSP, usuário, senha ou segredos do Agent.

## Finalização automática

A migration `20261001171911_monitoria_vip_gate3_trial_state_sync.sql` conecta o estado autoritativo do trial ao Projeto VIP:

- `trial ready → running` leva `ready_for_trial → trial_running`;
- fim da captura / `exploration` leva `trial_running → trial_completed`.

Isso acontece no PostgreSQL mesmo com todas as páginas fechadas. O cron já existente continua sendo responsável por encerrar a captura quando `capture_ends_at` chega.

## O que não mudou

- nenhum `.exe`/Agent;
- nenhum segundo trial;
- nenhum novo plano técnico de câmera;
- nenhum novo modelo de IA;
- nenhuma alteração em clientes padrão;
- nenhuma duplicação do cron de trial.

## Próximo Gate

Gate 4: prova de valor, relatório VIP, proposta comercial e transição para pagamento.
