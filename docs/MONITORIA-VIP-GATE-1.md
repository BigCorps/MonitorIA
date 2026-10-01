# MonitorIA VIP — Gate 1

## Objetivo

Criar a fundação comercial do MonitorIA VIP sem duplicar o MonitorIA e sem alterar o comportamento dos usuários atuais.

## Decisões de arquitetura

- `camera_plan_catalog` continua representando o comportamento técnico por câmera.
- Todo projeto VIP usa `intensive` em todas as câmeras.
- Os pacotes VIP ficam em `vip_plan_catalog`, separados do catálogo técnico.
- O trial continua reutilizando o motor `sales_assisted` já homologado: 60 minutos e até 6 câmeras.
- `vip_project_id` é opcional em `sales_trial_invites` e `trial_runs`; fluxos atuais ficam com `NULL` e permanecem inalterados.
- Projeto VIP nasce antes da organização e passa a apontar para o tenant quando o convite é resgatado.
- O usuário continua no funil até `active`.

## Planos

| Código | Incluídas | Mensal | Anual | Excedente mensal |
|---|---:|---:|---:|---:|
| `vip10` | 10 | R$ 1.299,00 | R$ 12.990,00 | R$ 129,00/câmera |
| `vip50` | 50 | R$ 4.999,00 | R$ 49.990,00 | R$ 99,00/câmera |
| `vip150` | 150 | R$ 11.990,00 | R$ 119.900,00 | R$ 79,00/câmera |

O contrato anual cobre a base do pacote. Câmeras acima da franquia são calculadas mensalmente.

## Estados

`lead → invited → project_setup → installing → calibrating → ready_for_trial → trial_running → trial_completed → proposal → payment_pending → active`

Há retornos controlados para correções de instalação/calibração/proposta e o estado terminal `cancelled`.

## Segurança

- `vip_projects` e `vip_project_status_events`: RLS habilitado e sem grants para `anon`/`authenticated`.
- `vip_plan_catalog`: somente leitura pública dos planos ativos, para a futura landing.
- RPCs comerciais VIP: somente `service_role`.
- Convite continua persistindo somente SHA-256 do token.
- Nenhuma credencial RTSP, segredo do Agent ou token em texto puro entra nas tabelas VIP.

## Supabase

Já aplicadas via MCP em produção:

- `20261001153532_monitoria_vip_gate1_foundation`
- `20261001153713_monitoria_vip_gate1_index_hardening`
- `20261001153831_monitoria_vip_gate1_atomic_invites`
- `20261001154741_monitoria_vip_gate1_integrity_hardening`

Os arquivos SQL deste ZIP são para sincronizar o histórico do GitHub. **Não execute novamente manualmente em produção.**

## Validações realizadas

- Catálogo com os três preços conferido diretamente no banco.
- `intensive / 60 min / 6 câmeras` travado por constraints.
- RLS e grants verificados.
- `transition_vip_project` e `create_vip_sales_invite` sem execução para `anon`/`authenticated`.
- Smoke test transacional de criação de Projeto VIP + convite + `lead → invited` aprovado e revertido; zero dados de teste permaneceram.
- Advisor de performance: índices das FKs VIP corrigidos em migration própria.

## Próximo Gate

Gate 2: onboarding VIP e readiness, incluindo roteamento pelo host `vip.monitoria.cam`, progresso persistente, estrutura do projeto, Agent, câmeras, calibração e preparação para o teste.
