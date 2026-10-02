# MonitorIA Agent 1.0.4 — backlog consolidado

> **Não implementar neste Gate.** O Agent 1.0.3 permanece congelado.

Este documento reúne somente melhorias que realmente exigem runtime local. O
Robustez Gate 3/3 usa os sinais que o backend já recebe hoje e não altera nenhum
arquivo em `agent/**`.

## O que o Agent 1.0.3 já faz hoje

Antes de planejar a 1.0.4, preservar estes comportamentos já existentes:

- retry/backoff por câmera;
- verificação periódica das câmeras;
- sincronização periódica da configuração;
- nova tentativa de autenticação quando o servidor rejeita temporariamente o Agent;
- fila local preservada em falhas transitórias;
- antecipação da primeira imagem depois da descoberta;
- tentativa de reencontrar a câmera na rede quando falhas repetidas indicam mudança de endereço local;
- diagnóstico local via IPC (`diagnose`) com falhas de câmera, fila, FFmpeg, logs e métricas do sistema.

O problema atual não é ausência total de recovery: é que grande parte desse
estado fica **somente dentro do computador**, então o painel não consegue dizer
com precisão qual tentativa está em andamento.

## Escopo proposto para 1.0.4

### 1. Watchdog real por câmera

- detectar monitor que deveria estar rodando e parou;
- distinguir processo morto, captura travada e processamento sem progresso;
- aplicar limites de restart para evitar loop;
- nunca reiniciar a câmera física nem mudar parâmetros do equipamento.

### 2. Auto-restart seguro do monitor local

- restart isolado por câmera;
- cooldown e limite por janela de tempo;
- preservar fila e sessão quando possível;
- motivo explícito de cada restart;
- evento `camera_monitor_self_recovered` quando houver recuperação confirmada.

### 3. Telemetria explícita por câmera

O backend precisa receber, sem RTSP, senha ou IP:

- `runtime_revision`;
- `runtime_state` (`starting`, `running`, `backoff`, `recovering`, `stopped`);
- `last_frame_at`;
- `last_event_at`;
- `failure_code`;
- `failure_attempts`;
- `next_retry_at`;
- `recovery_count`;
- `last_recovery_reason`;
- `last_self_recovered_at`;
- `monitor_started_at`;
- `monitor_restart_count`.

### 4. Captura viva x processamento parado

Hoje uma câmera pode continuar capturando enquanto outra parte do pipeline deixa
de avançar. A 1.0.4 deve produzir sinais separados para:

- frame chegando;
- monitor ativo;
- evento local produzido;
- fila crescendo;
- envio ao servidor;
- ingestão confirmada.

Isso permite dizer no painel **onde** a cadeia parou, sem inferir pelo silêncio.

### 5. Retry do pipeline local

- retry isolado sem reiniciar todo o Agent;
- backoff observável pelo backend;
- terminalização clara de falha não recuperável;
- evitar duplicidade de evento e clipe durante recuperação.

### 6. Diagnóstico FFmpeg / RTSP / RTMP

Expor somente códigos sanitizados, nunca URL ou credencial:

- autenticação recusada;
- caminho inexistente;
- conexão recusada;
- timeout/rede inacessível;
- limite de clientes;
- codec/stream incompatível;
- processo FFmpeg ausente ou inválido;
- RTMP bridge indisponível quando aplicável.

### 7. Contrato de recovery

Toda recuperação automática futura deve registrar:

- problema detectado;
- ação tentada;
- horário;
- resultado;
- duração;
- contador de tentativas;
- se houve perda de evidência durante o intervalo.

O painel deve continuar podendo afirmar com segurança:

- **recuperou sozinho**;
- **ainda tentando**;
- **precisa de intervenção**.

Nunca usar “Monitorando” apenas porque o processo existe.

## Critérios para produzir a 1.0.4

Só criar a atualização quando o lote estiver consolidado e puder ser validado de
uma vez em:

- Windows 24/7;
- Microsoft Store;
- Linux x64;
- Linux arm64;
- upgrade preservando configuração/cofre;
- troca/reparo de computador;
- câmeras individuais falhando sem derrubar as demais.

Até lá, correções web/backend devem permanecer fora de `agent/**`.
