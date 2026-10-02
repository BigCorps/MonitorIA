# Validação — MonitorIA Robustez Gate 3/3

## Base

- GitHub `main`: `593eaf36ebccf6a88f24e31870d92711726f8e6c`.
- Gate 3 foi construído para ser aplicado junto do Gate 2.
- Nenhuma migration Supabase nova.
- Nenhum arquivo `agent/**`.

## Backend analisado

Antes da implementação foram conferidos:

- estado de produto compartilhado das câmeras;
- heartbeat do Agent;
- `agent_health`;
- vínculos `agent_cameras`;
- sessões `capture_sessions`;
- `camera_evidence_gaps`;
- saúde visual das câmeras;
- auditoria sanitizada `camera.error`;
- diagnóstico seguro de suporte.

O schema do Supabase de produção foi conferido em modo somente leitura e contém os campos utilizados pelo Gate.

## Diagnóstico compartilhado

`src/camera/recovery-diagnosis.ts` é um motor puro compartilhado pelo VIP e pelo padrão.

Ele separa as causas em:

- Agent;
- câmera;
- plano;
- perfil;
- monitor local;
- pipeline;
- tudo certo.

Também identifica estados inconsistentes sem tentar consertá-los silenciosamente.

## Privacidade

O Gate usa `audit_logs.metadata.error_code`, mas deliberadamente não lê `error_message` para montar o diagnóstico de tela.

Não entram no diagnóstico:

- URL RTSP;
- usuário/senha;
- endereço IP;
- token do Agent;
- imagens/vídeos;
- payload de pagamento.

## Validação local executada

- parser TypeScript/TSX: sem erro sintático;
- `tsc --strict` do motor puro: aprovado;
- asserções de runtime do motor: aprovadas;
- cenário `continuous_monitor_failed`: coberto;
- scan `gpt-5-mini`: limpo;
- scan de padrões comuns de segredo: limpo;
- arquivos `agent/**`: 0;
- migrations novas: 0.

## O que ainda precisa ser validado após o upload

O runtime desta entrega não contém o checkout completo com todos os `node_modules` do repositório. Portanto a validação autoritativa do repositório completo continua sendo o CI após o upload:

```bash
npm run check
npm test
npm run build
```

Depois disso, confirme que o deploy Vercel do mesmo SHA ficou `READY`.

## Roteiro funcional recomendado

Com Gates 2 e 3 no mesmo SHA:

1. abrir Câmeras no padrão e no VIP;
2. confirmar que uma câmera saudável mostra causa “Tudo certo”;
3. desligar somente o Agent e confirmar diagnóstico de computador/Agent;
4. religar e confirmar que o diagnóstico volta ao normal sem recriar câmera;
5. testar uma câmera indisponível mantendo o Agent online;
6. confirmar que a causa aparece como câmera, e não Agent;
7. em uma câmera com perfil pendente, confirmar causa “Perfil”;
8. em uma câmera sem entitlement, confirmar causa “Plano”;
9. abrir “Ver diagnóstico avançado” e conferir heartbeat, imagem e análise;
10. usar “Verificar novamente” e confirmar que apenas o estado é atualizado;
11. confirmar que nenhum botão promete restart automático do Agent;
12. executar uma nova descoberta e conferir o Gate 2 junto: nenhuma duplicata deve ser criada em conflito claro.

## Agent 1.0.4

Os recursos que realmente dependem do runtime local foram documentados em `docs/MONITORIA-AGENT-1.0.4-BACKLOG.md` e não fazem parte deste overlay.
