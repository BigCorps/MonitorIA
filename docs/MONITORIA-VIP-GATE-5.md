# MonitorIA VIP — Gate 5

Este Gate transforma o fluxo comercial dos Gates 1–4 em um produto VIP ativo após pagamento, sem criar um segundo MonitorIA e sem alterar o Agent `.exe`.

## Entregas

- `vip.monitoria.cam` como host canônico do dashboard VIP.
- Sessão compartilhada entre `monitoria.cam` e `vip.monitoria.cam` por cookie `.monitoria.cam`; login/OAuth/MFA continuam canônicos no domínio principal.
- Dashboard VIP preto/dourado com Projetos como unidade principal.
- Projeto → locais → câmeras → membros → recursos beta.
- Todas as câmeras vinculadas ao VIP usam entitlement técnico `intensive`.
- Capacidade contratada protegida no banco, não apenas na UI.
- Ativação pós-Pix idempotente e com retry.
- Câmeras usadas no piloto são vinculadas automaticamente ao Projeto após pagamento.
- Pesquisa IA usa o mesmo Motor Máximo 2.0; contrato VIP vira uma fonte real de entitlement.
- Franquia da Pesquisa IA continua mensal, inclusive em contrato anual.
- Gravações locais também reconhecem entitlement VIP Intensive.
- Laboratório VIP com feature flags por Projeto.
- Guard contra câmera VIP com assinatura padrão não cancelada.

## Decisões de arquitetura

1. **Um contrato por Projeto, não uma assinatura por câmera.** Câmeras consomem capacidade do contrato.
2. **Sem novo repo/Supabase/Agent.** O VIP reutiliza a infraestrutura MonitorIA existente.
3. **Sem alterar o parser/planner da Pesquisa IA.** O Gate muda entitlement e franquia, não o Motor Máximo.
4. **Autenticação única.** O login continua em `monitoria.cam`; depois a rota `/vip/dashboard` volta ao subdomínio VIP com o mesmo cookie de sessão.
5. **Banco como autoridade.** A UI mostra a capacidade, mas `assign_vip_camera_v1` serializa concorrência e bloqueia excesso.

## Banco já aplicado

As migrations abaixo já foram aplicadas no projeto Supabase `xwejfayeackbrilipgrj`. Elas entram no ZIP somente para manter o GitHub alinhado com produção. Não executar manualmente de novo.

- `20261002002928_monitoria_vip_gate5_assistant_source`
- `20261002003111_monitoria_vip_gate5_entitlement_foundation`
- `20261002003225_monitoria_vip_gate5_entitlement_runtime`
- `20261002003519_monitoria_vip_gate5_index_hardening`
- `20261002003656_monitoria_vip_gate5_assistant_monthly_refresh`
- `20261002003814_monitoria_vip_gate5_security_definer_auth_hardening`
- `20261002004905_monitoria_vip_gate5_assistant_entitlement`
- `20261002004946_monitoria_vip_gate5_double_billing_guard`

## Edge Functions já implantadas

- `monitoria-create-pix` — CORS inclui `vip.monitoria.cam`.
- `monitoria-check-pix` — confirma pagamento e tenta ativação VIP idempotente.
- `monitoria-process-billing` — retry periódico de contratos `paid_pending_activation`.

## Ponto externo restante

O código já reconhece `vip.monitoria.cam`, mas o domínio precisa estar anexado ao mesmo projeto `monitoria` na Vercel/DNS. O conector Vercel disponível nesta sessão não expõe ação de escrita de domínio, então esse vínculo não foi alterado automaticamente neste Gate.
