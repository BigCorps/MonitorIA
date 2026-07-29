# MonitorIA v0.8.1

**Sua câmera vê. A IA lembra.**

O vídeo contínuo permanece no local. Somente quadros selecionados de
acontecimentos são enviados para análise.

## Recursos atuais

- Agent Windows;
- detecção local adaptativa;
- capítulos de atividade;
- modos Econômico, Equilibrado e Detalhado;
- perfil inteligente versionado e editável;
- seleção da imagem de referência;
- zonas de funcionários e clientes;
- títulos específicos dos acontecimentos;
- pessoas com papel operacional estruturado;
- eventos e pesquisa;
- comparação de períodos;
- exportação Markdown e JSON;
- revisão humana;
- auditoria e retenção.

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
APPLY-v0.8.1.md
CHANGES-v0.8.1.md
docs/ROADMAP-MONITORIA-V1.md
```

O Assistente IA continua adiado até a validação final da fase 7.
