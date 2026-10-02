# MonitorIA VIP — Gate 4: prova de valor, proposta e pagamento

## Princípio

O VIP não usa `camera_subscriptions` como unidade comercial. O contrato é do Projeto
VIP/organização e todas as câmeras continuam tecnicamente em `intensive`.

## Fluxo

```text
trial_completed
  -> vendedor apresenta proposta
proposal
  -> cliente escolhe mensal ou anual
payment_pending
  -> fatura + Pix
  -> pagamento confirmado
vip_contract = paid_pending_activation
  -> Gate 5 ativa entitlements e dashboard
```

## Prova de valor

O snapshot inclui quantidade de câmeras, eventos, vídeos preservados, continuidades,
itens para revisão, uso da Pesquisa IA e principais tipos de acontecimento. A proposta
guarda esse snapshot junto com os preços apresentados.

## Snapshot de preço

Cada versão da proposta congela:

- pacote;
- quantidade prevista;
- incluídas e excedentes;
- valor mensal;
- valor anual;
- pagamento inicial;
- estimativa de 12 meses;
- recomendação econômica para mensal e anual.

Alterações posteriores no catálogo não mudam uma proposta já apresentada.

## Segurança

`vip_proposals` e `vip_contracts` têm RLS ativado e não concedem acesso direto a
`anon` ou `authenticated`. Criação, aceite, reabertura e confirmação são RPCs
`service_role`-only. As Server Actions verificam organização, papel do cliente e
atribuição do vendedor antes de usar o backend privilegiado.

## Pix

A criação do Pix reaproveita `monitoria-create-pix`. A conferência reaproveita
`monitoria-check-pix`. O dispatcher `apply_confirmed_monitoria_payment` ganhou um
ramo VIP e preserva os ramos existentes de câmeras e créditos do Assistente.

No VIP, a confirmação:

- marca a fatura como paga;
- marca o contrato como `paid_pending_activation`;
- converte o trial para preservar a semântica de retenção;
- não cria `camera_subscriptions`;
- não ativa o ambiente definitivo neste Gate.
