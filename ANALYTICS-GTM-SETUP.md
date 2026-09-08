# MonitorIA — GTM / GA4 / OpenAI Ads

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

## OpenAI Ads Measurement Pixel

O site inicializa no `<head>` e carrega o SDK oficial
`https://bzrcdn.openai.com/sdk/oaiq.min.js` somente em `monitoria.cam` e
`www.monitoria.cam`, desde que a variável abaixo esteja configurada. A carga
antecipada preserva o `oppref` da landing antes de qualquer navegação:

```dotenv
NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID=SEU_PIXEL_ID
NEXT_PUBLIC_OPENAI_ADS_DEBUG=true
```

O Pixel ID é público e deve ser criado/copiado em **Ads Manager > Conversions >
Measurement Pixel**. Como a variável é incorporada ao bundle do Next.js, uma
nova implantação é necessária depois de configurá-la.

O consentimento do pixel fica negado por padrão e acompanha a mesma escolha do
aviso de cookies usada pelo Google. Não foi habilitado advanced matching e o
evento não inclui dados pessoais ou identificadores da conta.

### Conversão da campanha

- Evento OpenAI: `trial_started`
- Tipo: `plan_enrollment`
- `plan_id`: `monitoria_self_service_24h`
- Evento GA4 equivalente: `trial_start`

O marcador de conversão só é acrescentado depois que `start_monitoria_trial`
retorna sucesso para um novo teste. Respostas idempotentes com `duplicate: true`
não geram uma nova conversão. O navegador também deduplica o evento.

### Validação antes de investir

1. Criar o pixel no Ads Manager e configurar o ID no ambiente Production.
2. Implantar os arquivos desta alteração.
3. Aceitar os cookies de medição em uma sessão de teste.
4. Iniciar um trial elegível e confirmar no Ads Manager que `trial_started` foi
   recebido uma única vez.
5. Recarregar a página de confirmação e verificar que não existe segundo evento.
6. Alterar `NEXT_PUBLIC_OPENAI_ADS_DEBUG` para `false` e implantar novamente.
7. Só então selecionar `trial_started` como objetivo da campanha.

Não publicar campanha nem confirmar orçamento durante essa validação.
