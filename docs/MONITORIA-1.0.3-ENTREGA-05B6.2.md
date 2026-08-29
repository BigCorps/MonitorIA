# MonitorIA 1.0.3 — Fase 05B6.2

## Objetivo

Fechar três achados reais do Release Candidate sem alterar a arquitetura já homologada:

1. recuperar eventos da fila durável que atravessaram uma troca/reparo de Agent e ficaram com `capture_session_id` pertencente à identidade anterior;
2. corrigir o diagnóstico local de token recusado, que tratava URL errada como causa principal mesmo em um reparo legítimo Store ↔ 24/7;
3. impedir que escapes Latin-1 literais produzidos pela IA, como `balce3o` e `interae7e3o`, cheguem a `events.headline` / `events.summary`.

## 1. Fila durável após re-pareamento

O endpoint v2 continua validando rigorosamente uma sessão quando `sessionId` é enviada. Nenhuma autorização do servidor foi relaxada.

O Agent agora trata somente a resposta exata:

- HTTP `400`
- código `invalid_capture_session`
- evento local ainda possui `sessionId`

Nessa situação ele repete o mesmo `eventId`, os mesmos frames e as mesmas métricas sem `sessionId`. O backend pode então persistir o acontecimento sob a identidade atual. Qualquer outro 4xx continua seguindo a política normal de recusa da fila.

A métrica `captureSessionRecovery: "agent_repair"` registra no evento que essa recuperação ocorreu.

## 2. Status de token recusado

O comando `status` da 1.0.3 passa a reconhecer explicitamente troca/reparo, revogação de token e URL incorreta. Ele orienta o fluxo **Trocar ou reparar computador** e evita sugerir `reset`/`unpair` como primeiro passo.

O contador mostrado como recusas passa a dizer explicitamente que é histórico de tentativas, não quantidade de eventos pendentes.

## 3. Guard de texto gerado

A migration `20260829124500_generated_event_text_guard.sql` cria um normalizador conservador e um trigger `BEFORE INSERT OR UPDATE OF headline, summary` em `public.events`.

A conversão ocorre somente quando o token hexadecimal aparece entre letras e somente antes de revisão humana. A própria migration testa os dois casos observados no RC e aborta caso o PostgreSQL não produza:

- `balce3o` → `balcão`
- `interae7e3o` → `interação`

Tokens isolados, como `E3` em texto técnico, permanecem intactos.

## Validação esperada

Após aplicar este pacote e gerar um novo RC Windows:

- a instalação 24/7 existente deve ser atualizada sem apagar `C:\ProgramData\MonitorIA`;
- o pareamento atual e as duas câmeras originais devem permanecer;
- os dois eventos antigos ainda presentes na fila devem sair de `2` para `0` quando chegarem à próxima tentativa;
- o contador histórico de recusas pode continuar maior que zero e não deve ser interpretado como fila pendente;
- novos acontecimentos continuam com 4 imagens + vídeo;
- novos `headline`/`summary` não exibem os escapes observados.

## Travas de release

Este pacote **não** cria tag, não publica release, não troca download público, não altera `AGENT_RECOMMENDED_VERSION`, não configura `MONITORIA_STORE_PUBLIC_URL` e não submete nada à Microsoft Store.
