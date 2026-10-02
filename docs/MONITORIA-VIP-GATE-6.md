# MonitorIA VIP — Gate 6: landing, aquisição e validação comercial

## Funil definitivo

```text
vip.monitoria.cam
  -> formulário de avaliação
vip_lead_requests
  -> especialista qualifica
convert_vip_lead_request_v1
  -> vip_projects + sales_trial_invites (mesma transação)
lead/{token}
  -> autenticação guiada
  -> onboarding VIP
  -> prontidão
  -> piloto real de 60 min / até 6 câmeras
  -> prova de valor
  -> proposta
  -> Pix
  -> ativação
  -> dashboard VIP
```

## Decisões de UX baseadas no Clarity

### Confusão de autenticação
A landing VIP não oferece “criar conta”. O usuário só entra em autenticação depois
que recebeu um convite, ou pelo botão explícito “Já sou cliente VIP”.

### Cliques mortos/configuração inicial
A landing usa CTAs com destino claro. O piloto continua começando somente depois da
readiness técnica. O vendedor vê a próxima ação do onboarding.

### Inatividade
`onboarding_last_activity_at` e `onboarding_attention_code` são exibidos no funil
comercial. O especialista consegue identificar quem parou antes de esperar uma
solicitação de suporte.

## Aquisição

`vip_lead_requests` armazena somente o contexto comercial necessário. A tabela tem
RLS, não concede acesso a `anon`/`authenticated`, e é usada somente pelo backend
service-role.

Submissões abertas do mesmo e-mail são consolidadas para reduzir duplicação.

## Conversão atômica

`convert_vip_lead_request_v1` cria Projeto + convite dentro da mesma transação. Se
a criação do convite falhar, o Projeto também é revertido.

## Analytics

Clarity permanece limitado a páginas públicas. No subdomínio VIP os pixels de
marketing não carregam dentro do dashboard.

Eventos adicionados:
- `vip_hero_contact`
- `vip_hero_how_it_works`
- `vip_plan_vip10`, `vip_plan_vip50`, `vip_plan_vip150`
- `vip_mobile_sticky_contact`
- `vip_lead_submit`
- `vip_client_login`

Os mesmos cliques também entram no dataLayer como `vip_cta_click`.
