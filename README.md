# MonitorIA v0.8.2

**Sua câmera vê. A IA lembra.**

O vídeo contínuo permanece no local. Somente quadros selecionados de
acontecimentos são enviados para análise.

## Recursos atuais

- Agent Windows e segmentação por capítulos;
- modos Econômico, Equilibrado e Detalhado;
- perfil inteligente editável;
- eventos estruturados e revisáveis;
- exportação completa em Markdown e JSON;
- Pesquisa conversacional com GPT-5 nano;
- evidências clicáveis;
- histórico privado de conversas;
- página Instalador com saúde do Agent;
- auditoria, custos e retenção.

## Rotas principais

```text
/dashboard
/dashboard/cameras
/dashboard/events
/dashboard/events/[eventId]
/dashboard/search
/dashboard/installer
/dashboard/vision-tests
```

## Validação

```bash
npm install --include=dev
npm run check
npm test
npm run build
```

Consulte `APPLY-v0.8.2.md`, `CHANGES-v0.8.2.md` e
`docs/ROADMAP-MONITORIA-V1.md`.
