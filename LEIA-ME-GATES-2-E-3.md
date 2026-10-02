# MonitorIA — Robustez Gates 2/3 + 3/3

Este pacote combina os dois overlays finais de robustez para serem aplicados em um único upload/commit.

Base analisada: `main` em `593eaf36ebccf6a88f24e31870d92711726f8e6c`.

## Gate 2/3

- descoberta inteligente;
- deduplicação conservadora;
- reaproveitamento de câmera existente quando seguro;
- bloqueio de conflitos fortes;
- revisão clara por Local;
- limpeza assistida, sem apagar automaticamente.

## Gate 3/3

- diagnóstico operacional por câmera;
- separação entre Agent, câmera, plano, perfil, monitor e pipeline;
- detecção explícita de estado inconsistente;
- heartbeat, última imagem e última análise na mesma visão;
- orientação de recuperação em português;
- códigos RTSP sanitizados;
- suporte ao diagnóstico de falha do monitor contínuo;
- backlog único para o futuro Agent 1.0.4.

## Regras preservadas

- MonitorIA padrão + VIP compartilham o mesmo núcleo;
- nenhum arquivo `agent/**` é alterado;
- Agent continua 1.0.3;
- nenhuma migration nova;
- nenhuma URL RTSP, senha, IP ou token é exposto no diagnóstico;
- nada é apagado, reiniciado ou reconfigurado automaticamente para esconder uma falha.

## Depois do upload

Valide no mesmo SHA:

```bash
npm run check
npm test
npm run build
```

Depois confirme o deploy Vercel `READY`.
