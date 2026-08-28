# MonitorIA 1.0.3 — Fase 05B.1 / RC2

Correções originadas do teste real de upgrade 1.0.2 -> 1.0.3 em 28/08/2026.

## Bug 1 — heartbeat ainda reportava 1.0.2
O Core instalado era 1.0.3 e o status local mostrava 1.0.3, mas o scheduler
herdado da 1.0.2 chamava diretamente o heartbeat explícito 1.0.2.

Correção:
- o scheduler v2 continua responsável pela fila durável/retries;
- a 1.0.2 continua usando heartbeat v102 por padrão;
- a entrada 1.0.3 ativa explicitamente o heartbeat do runtime atual;
- o self-test 1.0.3 agora exige `heartbeatProfile = runtime`.

## Bug 2 — coletor incompatível com Windows PowerShell 5.1
`try/catch` era usado diretamente como valor de uma hashtable.
Agora os valores são calculados antes de montar o objeto.

## Arquivos
- agent/src/v102/runtime-scheduler.ts
- agent/src/index-v103.ts
- scripts/collect-rc-v103-evidence.ps1

## Depois de subir
1. Aguarde os checks normais do push.
2. Rode manualmente `Build MonitorIA 1.0.3 Release Candidate`.
3. Use `candidate = rc2`.
4. Não crie tag, release ou altere download público.
5. Se todos os jobs ficarem verdes, use somente os artifacts do RC2.
