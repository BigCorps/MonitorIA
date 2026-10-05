# MonitorIA Agent 1.0.3 — contrato consolidado da release

Este documento substitui os antigos `ENTREGA-*`, handoffs e matrizes intermediárias da construção 1.0.3.

## Estado

O Core 1.0.3 está congelado. Mudanças futuras de runtime local devem ser agrupadas como 1.0.4.

Entrada canônica do Core: `agent/src/index-v103.ts`.

Não criar uma nova tag `agent-v1.0.3`, alterar canal público ou publicar bytes diferentes sob a mesma URL como efeito colateral de um Gate web/backend.

`MONITORIA_STORE_PUBLIC_URL` é configuração de distribuição e não deve ser alterada silenciosamente.

## Canais

A release 1.0.3 mantém:

- Windows 24/7;
- Microsoft Store;
- Linux x64;
- Linux arm64.

O build RC é manual e não deve publicar release/tag automaticamente.

## Windows e assinatura

- Setup e uninstaller usam assinatura Authenticode;
- timestamp é obrigatório;
- Store instala por usuário;
- canal Store não cria NT Service;
- autostart Store só é habilitado após consentimento explícito;
- fechar a edição Store encerra apenas o Core daquela edição;
- a edição 24/7 mantém seu contrato próprio de serviço/tray.

## Evidência e recovery

Preservar:

- fila durável;
- pinning de evidência antes do risco de perda;
- retenção do vídeo associado à fila;
- recuperação de sessão antiga sem duplicar o evento;
- reparo/troca de computador preservando IDs e histórico quando o vínculo pode ser recuperado;
- estado visual temporal sem regressão causada por replay histórico.

## Matriz mínima de regressão local

Antes de uma futura release do Agent, validar pelo menos:

- duas câmeras;
- reboot;
- lock/unlock;
- upgrade;
- abertura/fechamento do aplicativo;
- troca/reparo de computador;
- Store e 24/7 sem interferirem entre si;
- Linux x64 e arm64;
- vídeo/evidência preservada em falha transitória.

## Privacidade

Nunca transportar senha, RTSP ou IP privado para telemetria remota. Diagnóstico remoto usa códigos sanitizados.

## Próxima versão

Não implementar melhorias isoladas dentro da 1.0.3. O escopo consolidado da 1.0.4 está em `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md`.
