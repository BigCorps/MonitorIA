create or replace function private.enable_monitoria_commercial_enforcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('active', 'grace_period') then
    update public.billing_accounts
    set entitlement_enforcement_enabled = true,
        updated_at = now()
    where organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

revoke all on function private.enable_monitoria_commercial_enforcement()
  from public, anon, authenticated;
grant execute on function private.enable_monitoria_commercial_enforcement()
  to service_role;

drop trigger if exists trg_camera_subscriptions_enable_enforcement
  on public.camera_subscriptions;
create trigger trg_camera_subscriptions_enable_enforcement
after insert or update of status on public.camera_subscriptions
for each row execute function private.enable_monitoria_commercial_enforcement();

create or replace function private.promote_converted_monitoria_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.camera_plan_catalog%rowtype;
begin
  if old.status = new.status or new.status <> 'converted' then
    return new;
  end if;

  select plan.*
    into v_plan
  from public.camera_subscriptions subscription
  join public.camera_plan_catalog plan
    on plan.code = subscription.plan_code
  where subscription.camera_id = new.camera_id;

  update public.events
  set expires_at = started_at +
        pg_catalog.make_interval(days => coalesce(v_plan.metadata_retention_days, 365)),
      updated_at = now()
  where trial_run_id = new.id;

  update public.storage_assets
  set expires_at = case
        when kind = 'preserved_clip' and coalesce(v_plan.clip_enabled, false)
          then captured_at + pg_catalog.make_interval(
            days => coalesce(v_plan.clip_retention_days, 30)
          )
        when kind = 'event_keyframe'
          then captured_at + pg_catalog.make_interval(
            days => coalesce(v_plan.metadata_retention_days, 365)
          )
        else expires_at
      end
  where trial_run_id = new.id
    and kind in ('event_keyframe', 'preserved_clip');

  update public.assistant_allowances
  set included_interactions = used_interactions,
      updated_at = now()
  where source = 'trial'
    and source_reference_id = new.id;

  return new;
end;
$$;

revoke all on function private.promote_converted_monitoria_trial()
  from public, anon, authenticated;
grant execute on function private.promote_converted_monitoria_trial()
  to service_role;

drop trigger if exists trg_trial_runs_promote_converted
  on public.trial_runs;
create trigger trg_trial_runs_promote_converted
after update of status on public.trial_runs
for each row execute function private.promote_converted_monitoria_trial();

-- Comentários operacionais.
comment on function public.prepare_monitoria_trial(uuid, uuid, text) is
  'Seleciona a única câmera e o modo do trial; não inicia o relógio.';
comment on function public.start_monitoria_trial(uuid) is
  'Inicia 24 horas de análise e sete dias adicionais de exploração, liberando 21 interações.';
comment on function public.process_monitoria_trials() is
  'Transiciona trial running para exploration e depois expired. Uso exclusivo de cron/service_role.';
comment on function public.purge_monitoria_trial_data(uuid) is
  'Apaga metadados do trial depois que os objetos do Storage forem removidos pelo cron.';
