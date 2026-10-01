# Validação — MonitorIA VIP Gate 2

## Base

- GitHub `main` observado antes do pacote: `7e1f2b9b0f48f572fcff622137fc5e9faf8dc383`
- Next.js: `16.3.8`
- Base anterior já validada pelo usuário: `372/372` testes + build de produção + Vercel OK.
- Este ZIP é cumulativo porque o Gate 1 ainda não constava no `main` remoto.

## Supabase — já executado

Projeto: `xwejfayeackbrilipgrj`

Gate 1:
- `20261001153532_monitoria_vip_gate1_foundation`
- `20261001153713_monitoria_vip_gate1_index_hardening`
- `20261001153831_monitoria_vip_gate1_atomic_invites`
- `20261001154741_monitoria_vip_gate1_integrity_hardening`

Gate 2:
- `20261001162012_monitoria_vip_gate2_onboarding_readiness`

A migration Gate 2 adicionou apenas campos de acompanhamento a `vip_projects` e a RPC
`refresh_vip_onboarding_v1`. Não altera o Agent, captura, análise, billing ou entitlement.

### Smoke test Gate 2

Foi criado em transação um Projeto VIP temporário ligado a uma organização existente e
executado `refresh_vip_onboarding_v1`.

Validado:
- resposta `success=true`;
- snapshot com Agent, câmeras, perfis, trial, readiness e próxima ação;
- persistência de `onboarding_last_activity_at`;
- rollback concluído;
- nenhum operador/projeto fictício permaneceu.

### Permissões da RPC Gate 2

`refresh_vip_onboarding_v1(uuid, boolean)`:
- `anon`: sem EXECUTE;
- `authenticated`: sem EXECUTE;
- `service_role`: EXECUTE.

### Advisors

Os advisors foram executados após as migrations.

- Não restaram avisos de índice de FK referentes às novas FKs VIP.
- Existem avisos antigos do projeto que não pertencem ao Gate 2.
- `vip_projects` e `vip_project_status_events` aparecem como RLS sem policy. Isso é
  intencional: as duas tabelas não têm grants diretos para `anon/authenticated` e
  são manipuladas apenas pelo backend/service role.
- Índices VIP aparecem como ainda não utilizados porque as tabelas são novas/vazias.

## Aplicação

Validações locais realizadas no overlay cumulativo:

- parser TypeScript/TSX: sem erro sintático;
- runtime das funções puras VIP:
  - preços;
  - limites 39 → VIP50 e 121 → VIP150;
  - máquina de estados;
  - próxima ação/readiness;
- checks de integração por fonte:
  - onboarding reutiliza Agent/discovery/contexto/trial existentes;
  - Gate 2 não chama `start_sales_monitoria_trial`;
  - login orienta método correto;
  - convite não força password-only;
  - VIP redireciona para `/vip/onboarding`;
  - dashboard padrão redireciona projetos VIP não ativos;
  - layout VIP preserva MFA;
  - trial padrão recebe ações claras de readiness.

## Limitação de validação local

O runtime de empacotamento não contém o checkout completo do repositório e seus
`node_modules`. Por isso **não foi possível reproduzir `npm run check`, `npm test` e
`npm run build` do repositório inteiro** aqui.

Depois do upload, GitHub/Vercel são a validação autoritativa. Não há necessidade de abrir
Codespace: se a Vercel apontar um erro de TypeScript/build, ele pode ser corrigido no próximo
ZIP a partir do log.

## Segurança/regressão

- nenhuma chave secreta incluída;
- nenhuma alteração no `.exe`/Agent;
- nenhuma alteração nos três planos técnicos atuais;
- nenhum novo trial mode;
- VIP continua reutilizando `sales_assisted`;
- todas as câmeras VIP continuam `intensive`;
- organizações sem Projeto VIP não são redirecionadas pelo novo gate do dashboard.
