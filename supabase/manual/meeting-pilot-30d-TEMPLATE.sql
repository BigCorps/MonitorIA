-- PILOTO COMERCIAL MANUAL — Meeting / 30 dias / 6 câmeras.
-- NÃO transformar em migration.
--
-- Preencha <ORGANIZATION_ID> e os 6 UUIDs.
-- Distribuição:
--   2 basic
--   2 standard
--   2 intensive
-- + 90 interações da Pesquisa IA.
--
-- Nenhuma fatura ou PIX é criado.

begin;

create temporary table _meeting_pilot_cameras (
  camera_id uuid primary key,
  plan_code text not null
    check (plan_code in ('basic', 'standard', 'intensive'))
) on commit drop;

insert into _meeting_pilot_cameras(camera_id, plan_code) values
  ('<CAMERA_ID_BASIC_1>'::uuid, 'basic'),
  ('<CAMERA_ID_BASIC_2>'::uuid, 'basic'),
  ('<CAMERA_ID_STANDARD_1>'::uuid, 'standard'),
  ('<CAMERA_ID_STANDARD_2>'::uuid, 'standard'),
  ('<CAMERA_ID_INTENSIVE_1>'::uuid, 'intensive'),
  ('<CAMERA_ID_INTENSIVE_2>'::uuid, 'intensive');

do $$
declare
  v_org_id uuid := '<ORGANIZATION_ID>'::uuid;
  v_count integer;
begin
  select count(*)
    into v_count
  from _meeting_pilot_cameras selected
  join public.cameras camera
    on camera.id = selected.camera_id
   and camera.organization_id = v_org_id;

  if v_count <> 6 then
    raise exception 'pilot_requires_exactly_6_cameras_from_same_organization';
  end if;
end
$$;

with current_prices as (
  select distinct on (price.plan_code)
    price.plan_code,
    price.id as price_version_id
  from public.camera_plan_price_versions price
  where price.valid_from <= now()
    and (price.valid_to is null or price.valid_to > now())
  order by price.plan_code, price.valid_from desc
)
insert into public.camera_subscriptions (
  camera_id,
  organization_id,
  plan_code,
  price_version_id,
  status,
  current_period_start,
  current_period_end,
  grace_ends_at,
  cancel_at_period_end,
  activated_at,
  suspended_at,
  cancelled_at,
  metadata,
  updated_at
)
select
  selected.camera_id,
  '<ORGANIZATION_ID>'::uuid,
  selected.plan_code,
  current_prices.price_version_id,
  'active'::public.camera_subscription_status,
  now(),
  now() + interval '30 days',
  now() + interval '30 days',
  true,
  now(),
  null,
  null,
  jsonb_build_object(
    'source', 'commercial_pilot',
    'partner', 'meeting',
    'no_charge', true,
    'pilot_days', 30,
    'activated_manually', true
  ),
  now()
from _meeting_pilot_cameras selected
join current_prices
  on current_prices.plan_code = selected.plan_code
on conflict (camera_id) do update
set
  organization_id = excluded.organization_id,
  plan_code = excluded.plan_code,
  price_version_id = excluded.price_version_id,
  status = excluded.status,
  current_period_start = excluded.current_period_start,
  current_period_end = excluded.current_period_end,
  grace_ends_at = excluded.grace_ends_at,
  cancel_at_period_end = excluded.cancel_at_period_end,
  activated_at = excluded.activated_at,
  suspended_at = null,
  cancelled_at = null,
  metadata = excluded.metadata,
  updated_at = now();

-- Mantém enforcement ligado: só as seis câmeras com assinatura ativa recebem acesso.
update public.billing_accounts
set
  entitlement_enforcement_enabled = true,
  updated_at = now()
where organization_id = '<ORGANIZATION_ID>'::uuid;

-- 90 interações independentes do MCP.
insert into public.assistant_allowances (
  organization_id,
  source,
  source_reference_id,
  period_start,
  period_end,
  included_interactions,
  used_interactions,
  expires_at,
  updated_at
)
values (
  '<ORGANIZATION_ID>'::uuid,
  'manual'::public.assistant_allowance_source,
  null,
  now(),
  now() + interval '30 days',
  90,
  0,
  now() + interval '30 days',
  now()
);

commit;
