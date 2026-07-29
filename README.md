# MonitorIA v0.7.3

**Sua câmera vê. A IA lembra.**

O MonitorIA transforma câmeras RTSP comuns em uma linha do tempo estruturada.
O vídeo contínuo permanece no equipamento local; somente quadros selecionados
de eventos são enviados para análise.

## Estado atual

- autenticação e organizações com RLS;
- cadastro e pareamento de câmeras;
- Agent Windows com DPAPI;
- perfil visual aprovado por câmera;
- detecção local de movimento;
- segmentação adaptativa por ruído;
- máscaras para relógios, overlays e zonas ignoradas;
- modos Econômico, Equilibrado e Detalhado;
- análise com GPT-5 nano e GPT-5 mini;
- telemetria de cache, raciocínio, latência e custo;
- A/B controlado entre nano e mini;
- retenção e expurgo diário;
- saúde do Agent consolidada por hora.

## Modos visuais

| Modo | Quadros | Modelo inicial |
|---|---:|---|
| Econômico | 1 | GPT-5 nano |
| Equilibrado | até 3 | GPT-5 nano, com escalonamento |
| Detalhado | até 4 | GPT-5 mini |

## Validação A/B

O A/B fica desligado por padrão. Para coletar até 50 comparações por câmera:

```env
VISION_AB_TEST_ENABLED=true
VISION_AB_TEST_SAMPLE_PERCENT=100
VISION_AB_TEST_MAX_PER_CAMERA=50
```

A avaliação fica disponível em:

```text
/dashboard/vision-tests
```

Depois de coletar a amostra, volte `VISION_AB_TEST_ENABLED=false`.

## Agent

Baixe o artifact `monitoria-agent-windows-x64-baseline-v0.7.3`.

```powershell
Unblock-File "$env:USERPROFILE\Downloads\monitoria-agent.exe"
& "$env:USERPROFILE\Downloads\monitoria-agent.exe" self-test
& "$env:USERPROFILE\Downloads\monitoria-agent.exe" status
& "$env:USERPROFILE\Downloads\monitoria-agent.exe"
```

A configuração da v0.7.2 é compatível. Não execute `reset`.

## Validação

```bash
npm install --include=dev
npm run check
npm test
npm run build
```

Consulte `docs/VALIDATION-v0.7.3.md` e `docs/ROADMAP-MONITORIA-V1.md`.
