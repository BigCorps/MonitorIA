create index if not exists assistant_credit_purchases_invoice_idx
  on public.assistant_credit_purchases (invoice_id)
  where invoice_id is not null;

alter table public.assistant_credit_purchases
  add column if not exists updated_at timestamptz not null default now();

create or replace function private.touch_assistant_credit_purchase_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists assistant_credit_purchases_touch_updated_at
  on public.assistant_credit_purchases;
create trigger assistant_credit_purchases_touch_updated_at
before update on public.assistant_credit_purchases
for each row
execute function private.touch_assistant_credit_purchase_updated_at();

revoke all on function private.touch_assistant_credit_purchase_updated_at()
from public, anon, authenticated;
