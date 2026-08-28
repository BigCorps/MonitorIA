# MonitorIA 1.0.3 — Fase 05B.2

## Objetivo

Corrigir a perda intermitente de JPEGs/evidência visual observada no RC Windows 24/7 com duas câmeras reais, sem alterar o backend, o pareamento, a fila durável, a política comercial ou a base standalone 1.0.2.

## Evidência de campo que motivou a correção

No RC 1.0.3:

- as duas câmeras ficaram online e geraram acontecimentos;
- os vídeos foram preservados;
- alguns acontecimentos do plano `intensive` chegaram com apenas 1 imagem;
- `camera_evidence_gaps` registrou `visual_evidence_unavailable` nas duas câmeras;
- o log local registrou ocorrências como `ficou sem quadro utilizável` e `A timeline local não possui segmentos para este acontecimento`.

## Causa raiz

A timeline grava MPEG-TS usando `-c:v copy` e `-segment_time 3`.

Com stream copy, o FFmpeg normalmente precisa aguardar um keyframe para fechar um segmento. Portanto o arquivo físico pode durar 6, 9, 12 segundos ou mais, conforme o GOP enviado pelo DVR.

A implementação anterior catalogava todo segmento como se tivesse exatamente 3 segundos:

`startedAt = modifiedAt - 3000`

Além disso, a extração do JPEG limitava o seek ao intervalo de aproximadamente 3 segundos. Um quadro que estivesse no segundo 8 de um segmento físico de 11 segundos passava a ser procurado no segundo 2,95, ou o segmento nem era considerado pertencente ao horário solicitado.

## Correção 05B.2

A camada `agent/src/v103/timeline-segment-timing.ts` é instalada somente pelo entrypoint 1.0.3.

Ela:

1. reconstrói a janela real aproximada dos `.ts` pelo timestamp/índice gravado no nome e pelo fechamento do segmento anterior do mesmo processo FFmpeg;
2. mantém a 1.0.2 standalone intocada;
3. amplia a espera por fechamento do segmento para 20 segundos, tolerando GOPs maiores de DVRs reais;
4. calcula o seek usando a duração reconstruída do segmento, sem truncar em 2,95 s;
5. entra antes do `early-evidence-pinning`, de modo que JPEG, pinning e vídeo compartilhem a mesma visão da timeline;
6. adiciona contrato ao `self-test` do Core 1.0.3;
7. adiciona regressão automática para segmento físico maior que 3 segundos.

## Arquivos

- `agent/src/v103/timeline-segment-timing.ts`
- `agent/src/index-v103.ts`
- `test/agent-0103-timeline-segment-timing.test.ts`
- `.github/workflows/validate-release-candidate-v103.yml`
- `docs/MONITORIA-1.0.3-ENTREGA-05B2.md`

## O que NÃO muda

- Supabase: nenhuma migration/Edge/configuração.
- Vercel: nenhuma alteração.
- pareamento existente: preservado.
- fila `durable-v2`: preservada.
- endpoint de eventos v2: preservado.
- download público 1.0.2: não alterado.
- `AGENT_RECOMMENDED_VERSION`: não alterado.
- Store: não publicada.
- tag final 1.0.3: não criada.

## Validação esperada

Após subir a entrega:

1. aguardar `Validate MonitorIA 1.0.3 Release Candidate Contract` ficar verde;
2. executar novamente `Build MonitorIA 1.0.3 Release Candidate` (o identificador pode continuar `rc1` durante estes testes internos);
3. confirmar no self-test a linha `Timeline RTSP variável: sim`;
4. instalar o novo Windows 24/7 por cima do RC atual, sem desinstalar e sem reparar;
5. confirmar `2 monitorando de 2`;
6. produzir movimentos nas duas câmeras;
7. validar que eventos `intensive` conseguem preservar múltiplas imagens quando `start/peak/end` existem, sem novas lacunas `visual_evidence_unavailable` atribuíveis à janela de segmento;
8. repetir o teste de reboot-before-login somente depois deste ponto ficar verde.

## Pendência separada

O `unins000.exe` do Inno Setup foi encontrado sem Authenticode. Isso continua como correção de packaging obrigatória antes da publicação final/Microsoft Store, mas é independente desta falha de timeline/evidência.
