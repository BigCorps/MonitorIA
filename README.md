# MonitorIA v0.8.0

**Sua câmera vê. A IA lembra.**

O MonitorIA transforma câmeras RTSP comuns em uma linha do tempo
estruturada e pesquisável. O vídeo contínuo permanece no local;
somente quadros selecionados de eventos são enviados para análise.

## Estado atual

- Agent Windows v0.7.3;
- segmentação adaptativa;
- modos Econômico, Equilibrado e Detalhado;
- GPT-5 nano e GPT-5 mini;
- telemetria de custo;
- linha do tempo de eventos;
- detalhe visual do evento;
- revisão humana;
- pesquisa textual;
- comparação entre períodos;
- exportação Markdown e JSON;
- thumbnails reais das câmeras;
- retenção e auditoria.

## Rotas principais

```text
/dashboard
/dashboard/cameras
/dashboard/events
/dashboard/events/[eventId]
/dashboard/search
/dashboard/vision-tests
```

## Validação

```bash
npm install --include=dev
npm run check
npm test
npm run build
```

Consulte:

```text
APPLY-v0.8.0.md
CHANGES-v0.8.0.md
docs/ROADMAP-MONITORIA-V1.md
```

O Assistente IA será construído somente após a validação final da
fase 7.
