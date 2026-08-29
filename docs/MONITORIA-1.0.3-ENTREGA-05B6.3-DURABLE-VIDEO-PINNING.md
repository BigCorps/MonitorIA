# MonitorIA 1.0.3 — Fase 05B6.3

## Vídeo pinado durável após fila/reparo

### Problema observado

O teste real da 05B6.2.1 provou que a fila durável consegue atravessar uma troca de Agent e recuperar o mesmo `agent_event_id` sem duplicação. Um dos dois acontecimentos ficou, porém, quase 22 horas aguardando até ser aceito novamente. As fotos continuaram na fila, mas os segmentos locais necessários para reconstruir um dos vídeos já tinham sido removidos pelo orçamento de vídeo.

A causa era uma diferença de ciclo de vida:

- a fila durável não possui TTL destrutivo por padrão;
- o early-pinning copiava segmentos para `<eventId>.pinning`;
- a proteção em memória desses segmentos era liberada após 2 horas;
- depois disso o orçamento normal de vídeo podia remover os `.ts` fixados;
- em reboot, um pinning com manifesto antigo também podia ser tratado como resíduo.

### Correção

A 05B6.3 transforma `*.pinning` em evidência de vídeo persistente:

1. O orçamento global reconhece arquivos dentro de `*.pinning` mesmo depois de reboot e mesmo sem a proteção em memória original.
2. A poda normal e o limite adaptativo nunca removem esses arquivos.
3. Se o acontecimento ainda existe na fila durável, o manifesto é renovado antes da recuperação do early-pinning, independentemente da idade.
4. Quando o servidor aceita o acontecimento, o Agent grava `.accepted.json` no pinning. Isso concede uma janela de 7 dias para uma solicitação de clipe assíncrona sobreviver a desligamento/reboot após a aceitação do evento.
5. Quando o clipe é concluído e o fluxo existente chama `removePreservedClip`, o diretório pinado continua sendo removido normalmente.
6. Em ENOSPC real, a ordem de sacrifício é: ring-buffer → evidência comum → `*.pinning` como último recurso. A fila e as fotos continuam com prioridade máxima.

### Arquivos

- `agent/src/v102/disk-budget.ts`
- `agent/src/v103/durable-pinning-retention.ts` (novo)
- `agent/src/index-v103.ts`
- `test/agent-0103-early-pinning.test.ts`
- `test/agent-0103-release-candidate-contract.test.ts`
- `docs/MONITORIA-1.0.3-ENTREGA-05B6.3-DURABLE-VIDEO-PINNING.md`
- `docs/MONITORIA-1.0.3-MICROSOFT-STORE-CERTIFICATION.md`

### Invariantes preservadas

- versão continua `1.0.3`;
- nenhum SQL/backend novo;
- nenhuma tag/release/publicação;
- mesmo Core para Windows 24/7, Store e Linux;
- fila/fotos continuam superiores ao vídeo em pressão de disco;
- nenhuma mudança de IDs de câmera/Agent;
- 1.0.2 público permanece congelado.

### Validação esperada

O workflow de contrato deve ficar verde. Depois será gerado um novo RC e validaremos o self-test com a linha:

`Vídeo pinado atravessa fila/reparo: sim`

Não é necessário recriar artificialmente um atraso de 22 horas no computador do teste. Os testes de regressão exercitam a persistência de `*.pinning`, a prioridade da fila e o estágio extremo de ENOSPC de forma determinística.
