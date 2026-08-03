-- Restringe payloads brutos do Banco Inter ao backend.
-- O dashboard recebe somente as colunas necessárias para exibir e acompanhar o Pix.

revoke select on table public.billing_pix_payments
  from authenticated;

grant select (
  id,
  organization_id,
  invoice_id,
  status,
  txid,
  amount_cents,
  pix_copy_paste,
  qr_code_payload,
  bank_status,
  expires_at,
  confirmed_at,
  last_checked_at,
  check_attempts,
  error_code,
  error_message,
  created_at,
  updated_at
) on table public.billing_pix_payments
  to authenticated;

grant all on table public.billing_pix_payments
  to service_role;

comment on column public.billing_pix_payments.provider_payload is
  'Payload bruto da criação bancária. Restrito ao backend service_role.';

comment on column public.billing_pix_payments.provider_last_response is
  'Última resposta bruta da consulta bancária. Restrita ao backend service_role.';
