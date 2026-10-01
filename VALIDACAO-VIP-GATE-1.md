# MonitorIA VIP — Gate 1 — Validação

## Escopo

Este Gate cria somente a fundação comercial e de estado do MonitorIA VIP. Ele não altera o Agent, não troca o motor do trial atual e não muda o comportamento dos clientes MonitorIA existentes.

## Supabase aplicado

As migrations abaixo **já foram aplicadas em produção via MCP** no projeto MonitorIA e entram neste ZIP apenas para manter o histórico do GitHub sincronizado:

- `20261001153532_monitoria_vip_gate1_foundation.sql`
- `20261001153713_monitoria_vip_gate1_index_hardening.sql`
- `20261001153831_monitoria_vip_gate1_atomic_invites.sql`
- `20261001154741_monitoria_vip_gate1_integrity_hardening.sql`

Não execute essas migrations manualmente outra vez.

## Contrato comercial validado

- VIP 10: 10 câmeras incluídas, R$ 1.299/mês, R$ 12.990/ano, excedente R$ 129/câmera/mês.
- VIP 50: 50 câmeras incluídas, R$ 4.999/mês, R$ 49.990/ano, excedente R$ 99/câmera/mês.
- VIP 150: 150 câmeras incluídas, R$ 11.990/mês, R$ 119.900/ano, excedente R$ 79/câmera/mês.
- Todas as câmeras VIP usam tecnicamente `intensive`.
- Trial assistido: 60 minutos, máximo de 6 câmeras.
- O pacote comercial mínimo parte de 10 câmeras; o trial pode usar menos porque é um piloto assistido.

## Isolamento e segurança verificados

- `vip_plan_catalog`: RLS ativo; leitura pública somente de planos ativos; sem INSERT/UPDATE para `anon` ou `authenticated`.
- `vip_projects`: RLS ativo; sem SELECT/INSERT/UPDATE para `anon` ou `authenticated`; acesso pelo backend `service_role`.
- `vip_project_status_events`: mesma proteção server-side.
- `create_vip_sales_invite(...)`: `anon=false`, `authenticated=false`, `service_role=true` para EXECUTE.
- `transition_vip_project(...)`: `anon=false`, `authenticated=false`, `service_role=true` para EXECUTE.
- A migration `20261001154741` trava também no banco atualizações diretas de status que tentem pular a máquina de estados.
- `sales_trial_invites.vip_project_id` e `trial_runs.vip_project_id` são opcionais; `NULL` preserva integralmente os fluxos atuais.

## Smoke tests transacionais no banco

Foram executados dois testes dentro de transações com `ROLLBACK`:

1. criação de vendedor fictício + Projeto VIP + transição `lead → invited` + convite `intensive / 60 min / 6 câmeras`;
2. criação atômica via `create_vip_sales_invite`, verificando projeto, convite e histórico de status.

Após os rollbacks, foi confirmado que não restaram vendedores nem Projetos VIP fictícios no banco.

## Advisors

O advisor de performance inicialmente apontou índices de apoio ausentes nas novas foreign keys VIP. A migration `20261001153713` adicionou esses índices e a verificação posterior não mostrou mais avisos de FK/index específicos do VIP.

O advisor de segurança continua exibindo avisos antigos do projeto (incluindo tabelas RLS sem policy por desenho e funções `SECURITY DEFINER` anteriores). Esses avisos não foram alterados neste Gate. As novas RPCs VIP foram verificadas independentemente e não são executáveis por `anon` ou `authenticated`.

## Validação local do código

- módulos puros VIP passaram por `tsc --noEmit --noCheck`;
- arquivos server-side e testes passaram pelo parser TypeScript sem erro de sintaxe;
- lógica comercial validada localmente:
  - 38 câmeras → VIP10 ainda é o menor custo mensal;
  - 39 câmeras → VIP50 passa a ser mais barato;
  - 120 câmeras → VIP50 ainda é o menor custo mensal;
  - 121 câmeras → VIP150 passa a ser mais barato;
- máquina de estados bloqueia saltos como `lead → active` e `trial_running → proposal`.

## Limitação desta validação

O repositório completo não foi clonado no runtime de geração do ZIP porque esse ambiente não possuía resolução DNS externa para GitHub. Portanto, não foi executado um novo `npm test`/`npm run build` do repositório inteiro aqui. O `main` de base (`7e1f2b9b0f48f572fcff622137fc5e9faf8dc383`) havia acabado de ser validado no Codespace com 372/372 testes e build Next.js 16.3.8 concluído com sucesso. Após o upload deste ZIP, o próximo passo é conferir o commit e o deploy antes do Gate 2.
