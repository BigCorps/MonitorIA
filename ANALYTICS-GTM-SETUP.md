# MonitorIA — GTM / GA4

- Host: `monitoria.cam`
- GTM: `GTM-MXQX5Z8X`
- GA4: `G-S0N8FML9WK`

## Eventos enviados

- `trial_cta_click` — clique em começar teste grátis
- `trial_start` — confirmação de que as 24 horas reais começaram
- `begin_checkout` — fatura aberta para pagamento
- `purchase` — pagamento da fatura confirmado

`purchase` usa o ID da fatura como `transaction_id` e lê o valor já calculado/exibido pela cobrança do servidor.

## GTM

1. Criar Google Tag com `G-S0N8FML9WK` em Initialization / All Pages.
2. Criar tags GA4 Event para os quatro eventos acima.
3. Em `begin_checkout` e `purchase`, encaminhar `currency`, `value` e `transaction_id`.
4. Marcar `trial_start` e `purchase` como conversões; manter `trial_cta_click` apenas como evento de diagnóstico.
5. Validar no Tag Assistant antes de investir.

Consent Mode v2 fica negado por padrão até o usuário aceitar.
