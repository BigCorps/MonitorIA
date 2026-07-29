# MonitorIA Agent v0.7.3

O Agent mantém o vídeo contínuo no computador local e envia somente quadros
selecionados de eventos.

## Segmentação adaptativa

- calibração inicial do ruído da câmera;
- percentis p50, p90 e p95;
- limiares efetivos próprios por câmera;
- máscara de zonas `ignore`;
- supressão automática de relógios e overlays nas bordas;
- vários quadros consecutivos para iniciar e encerrar;
- cooldown entre eventos;
- bloqueio de reabertura após `maximum_duration` até a cena repousar;
- agenda semanal e modo significativo fora do expediente.

## Modos

- Econômico: um quadro, largura máxima de 960 px;
- Equilibrado: até três quadros, largura máxima de 960 px;
- Detalhado: até quatro quadros, largura máxima de 1280 px.

## Atualização

A configuração v0.7.2 é compatível. Feche o executável antigo e abra a v0.7.3.
Não execute `reset`.

```powershell
.\monitoria-agent.exe self-test
.\monitoria-agent.exe status
.\monitoria-agent.exe
```
