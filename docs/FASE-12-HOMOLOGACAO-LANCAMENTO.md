# Fase 12 — homologação e lançamento controlado

Esta fase fecha o MonitorIA 1.0 com alertas inteligentes determinísticos, um gate auditável de produção e abertura controlada de novos cadastros.

## Alertas inteligentes

O cron operacional reaproveita dados já calculados pelas fases anteriores. Não existe chamada adicional de modelo e cada insight registra `additionalModelCalls: 0`.

Os doze tipos cobertos são abertura atrasada, fechamento não observado, reabertura, acesso restrito, objeto retirado, equipamento fora do horário, fila excessiva, sessão longa, câmera obstruída, enquadramento alterado, baixa qualidade e processo incompleto.

Cada alerta contém condição, confiança, evidências, horário, câmera/local, motivo, limite e recomendação de verificação. O sistema apresenta hipótese operacional, nunca identidade ou intenção da pessoa.

## Gate de produção

O primeiro cron depois da migration registra a avaliação em `release_gate_runs`. O painel fica em `/dashboard/admin/launch` e só é acessível a operadores internos.

O gate verifica build, testes, migrations, RLS, trial, cobrança Pix idempotente, Agent, retenção, Assistente, inteligência/MCP, COGS, cron, suporte, jurídico e privacidade. Evidências que dependem de acontecimento real não são aprovadas automaticamente:

- confirmação de Pix real;
- restauração real de backup;
- compatibilidade registrada por instalação real;
- recuperação real do Agent.

Essas evidências ficam na tabela de serviço `release_evidence`. Não insira uma aprovação sem um registro externo verificável.

## Abertura de cadastros

O padrão é `GENERAL_SIGNUP_ENABLED=false`. Login de contas existentes continua normal; visitantes recebem o canal de solicitação de acesso.

Somente depois de o gate ficar `ready`, configure `GENERAL_SIGNUP_ENABLED=true` no ambiente de produção e publique novamente. A flag é validada no servidor, inclusive na action de criação de conta.

## Ordem de implantação

1. Execute o SQL da fase 12 no Supabase.
2. Aplique o ZIP do frontend no repositório e publique pela Vercel.
3. Aguarde o cron operacional e consulte o gate interno.
4. Mantenha o cadastro geral fechado enquanto houver bloqueios reais.

As calibrações de prompt e inteligência permanecem fora desta entrega, conforme definido para depois das doze fases.
