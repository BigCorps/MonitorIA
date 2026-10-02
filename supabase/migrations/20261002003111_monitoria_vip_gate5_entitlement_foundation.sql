-- MonitorIA VIP — Gate 5
-- Projeto ativo -> locais/câmeras/membros/features + ativação atômica pós-Pix.

create table if not exists public.vip_project_sites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'active' check (status in ('active','removed')),
  linked_source text not null default 'manual' check (linked_source in ('trial_activation','manual')),
  linked_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, site_id)
);
create index if not exists vip_project_sites_org_project_idx on public.vip_project_sites(organization_id,project_id,status);
create index if not exists vip_project_sites_site_idx on public.vip_project_sites(site_id);
alter table public.vip_project_sites enable row level security;
revoke all on public.vip_project_sites from anon, authenticated;
grant all on public.vip_project_sites to service_role;

create table if not exists public.vip_project_cameras (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  status text not null default 'active' check (status in ('active','removed')),
  linked_source text not null default 'manual' check (linked_source in ('trial_activation','manual')),
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, camera_id)
);
create unique index if not exists vip_project_cameras_one_active_project_idx on public.vip_project_cameras(camera_id) where status='active';
create index if not exists vip_project_cameras_project_status_idx on public.vip_project_cameras(project_id,status,created_at);
create index if not exists vip_project_cameras_org_status_idx on public.vip_project_cameras(organization_id,status);
create index if not exists vip_project_cameras_site_idx on public.vip_project_cameras(site_id);
alter table public.vip_project_cameras enable row level security;
revoke all on public.vip_project_cameras from anon, authenticated;
grant all on public.vip_project_cameras to service_role;

create table if not exists public.vip_project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','researcher','viewer')),
  status text not null default 'active' check (status in ('active','removed')),
  source text not null default 'organization_sync' check (source in ('organization_sync','manual')),
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now(),
  removed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,user_id)
);
create index if not exists vip_project_members_user_status_idx on public.vip_project_members(user_id,status);
create index if not exists vip_project_members_org_project_idx on public.vip_project_members(organization_id,project_id,status);
alter table public.vip_project_members enable row level security;
revoke all on public.vip_project_members from anon, authenticated;
grant all on public.vip_project_members to service_role;

create table if not exists public.vip_feature_catalog (
  code text primary key,
  display_name text not null,
  description text not null default '',
  stage text not null default 'beta' check (stage in ('stable','beta','experimental')),
  default_enabled_vip boolean not null default false,
  sort_order smallint not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.vip_feature_catalog enable row level security;
revoke all on public.vip_feature_catalog from anon, authenticated;
grant all on public.vip_feature_catalog to service_role;

insert into public.vip_feature_catalog(code,display_name,description,stage,default_enabled_vip,sort_order) values
 ('motor_maximo_v2','Pesquisa IA — Motor Máximo 2.0','Planejamento híbrido determinístico com fallback gpt-5-nano somente quando necessário.','stable',true,10),
 ('cross_camera_intelligence','Inteligência entre câmeras','Continuidade e passagens prováveis entre câmeras sem identificação biométrica.','beta',true,20),
 ('camera_health_history','Histórico de saúde das câmeras','Disponibilidade, degradação e qualidade operacional histórica.','beta',true,30),
 ('routine_intelligence','Inteligência de rotinas','Consulta de rotinas e desvios operacionais configurados.','beta',true,40),
 ('process_intelligence','Inteligência de processos','Consulta de processos, etapas e desvios configurados.','beta',true,50),
 ('vip_beta_lab','Laboratório VIP','Canal controlado para liberar melhorias primeiro no MonitorIA VIP.','beta',true,90)
on conflict(code) do update set
 display_name=excluded.display_name, description=excluded.description, stage=excluded.stage,
 default_enabled_vip=excluded.default_enabled_vip, sort_order=excluded.sort_order, updated_at=now();

create table if not exists public.vip_project_features (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  feature_code text not null references public.vip_feature_catalog(code) on delete restrict,
  enabled boolean not null default false,
  source text not null default 'catalog_default' check (source in ('catalog_default','override')),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config)='object'),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,feature_code)
);
create index if not exists vip_project_features_project_enabled_idx on public.vip_project_features(project_id,enabled);
create index if not exists vip_project_features_feature_idx on public.vip_project_features(feature_code);
alter table public.vip_project_features enable row level security;
revoke all on public.vip_project_features from anon, authenticated;
grant all on public.vip_project_features to service_role;

create or replace function private.vip_contract_is_current(p_contract public.vip_contracts)
returns boolean language sql stable set search_path='' as $$
  select p_contract.status in ('active','grace_period')
    and p_contract.base_period_start is not null and p_contract.base_period_start<=now()
    and (
      (p_contract.status='active' and p_contract.base_period_end is not null and p_contract.base_period_end>now())
      or
      (p_contract.status='grace_period' and coalesce(nullif(p_contract.metadata->>'graceEndsAt','')::timestamptz,p_contract.base_period_end)>now())
    );
$$;
revoke all on function private.vip_contract_is_current(public.vip_contracts) from public,anon,authenticated;
grant execute on function private.vip_contract_is_current(public.vip_contracts) to service_role;

create or replace function public.activate_paid_vip_contract_v1(p_contract_id uuid,p_actor_user_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_contract public.vip_contracts%rowtype;
  v_project public.vip_projects%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_payment public.billing_pix_payments%rowtype;
  v_trial public.trial_runs%rowtype;
  v_row record;
  v_active integer:=0;
  v_sites integer:=0;
  v_members integer:=0;
  v_features integer:=0;
begin
  perform private.require_monitoria_service_role();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_contract_id::text||':vip-activation',0));

  select * into v_contract from public.vip_contracts where id=p_contract_id for update;
  if not found then raise exception 'vip_contract_not_found'; end if;
  select * into v_project from public.vip_projects where id=v_contract.project_id for update;
  if not found or v_project.organization_id is distinct from v_contract.organization_id then raise exception 'vip_project_contract_mismatch'; end if;

  if v_contract.status='active' and v_project.status='active' then
    select count(*) into v_active from public.vip_project_cameras where project_id=v_project.id and status='active';
    return jsonb_build_object('success',true,'duplicate',true,'status','active','contractId',v_contract.id,'projectId',v_project.id,'contractedCameras',v_contract.contracted_camera_count,'activeCameras',v_active,'remainingCapacity',greatest(v_contract.contracted_camera_count-v_active,0));
  end if;

  if v_contract.status<>'paid_pending_activation' or v_project.status<>'payment_pending' then raise exception 'vip_contract_not_ready_for_activation'; end if;
  select * into v_invoice from public.billing_invoices where id=v_contract.invoice_id and organization_id=v_contract.organization_id for update;
  if not found or v_invoice.status<>'paid' or v_invoice.paid_at is null then raise exception 'vip_invoice_not_paid'; end if;
  select * into v_payment from public.billing_pix_payments where id=v_contract.payment_id and invoice_id=v_invoice.id and organization_id=v_contract.organization_id for update;
  if not found or v_payment.status<>'confirmed' or v_payment.confirmed_at is null then raise exception 'vip_payment_not_confirmed'; end if;

  select * into v_trial from public.trial_runs
   where vip_project_id=v_project.id and organization_id=v_contract.organization_id
   order by created_at desc limit 1 for update;
  if not found or v_trial.status::text<>'converted' then raise exception 'vip_trial_not_converted'; end if;

  if (select count(*) from public.trial_run_cameras where trial_run_id=v_trial.id and status<>'removed') > v_contract.contracted_camera_count then
    raise exception 'vip_trial_exceeds_contracted_capacity';
  end if;

  for v_row in
    select c.id camera_id,c.site_id
    from public.trial_run_cameras trc join public.cameras c on c.id=trc.camera_id and c.organization_id=trc.organization_id
    where trc.trial_run_id=v_trial.id and trc.organization_id=v_contract.organization_id and trc.status<>'removed'
    order by trc.created_at,trc.id
  loop
    insert into public.vip_project_sites(project_id,organization_id,site_id,status,linked_source,metadata)
    values(v_project.id,v_contract.organization_id,v_row.site_id,'active','trial_activation',jsonb_build_object('trialRunId',v_trial.id))
    on conflict(project_id,site_id) do update set status='active',linked_source='trial_activation',removed_at=null,updated_at=now();

    insert into public.vip_project_cameras(project_id,organization_id,camera_id,site_id,status,linked_source,linked_by,metadata)
    values(v_project.id,v_contract.organization_id,v_row.camera_id,v_row.site_id,'active','trial_activation',p_actor_user_id,jsonb_build_object('trialRunId',v_trial.id))
    on conflict(project_id,camera_id) do update set site_id=excluded.site_id,status='active',linked_source='trial_activation',linked_by=coalesce(excluded.linked_by,public.vip_project_cameras.linked_by),linked_at=now(),removed_at=null,updated_at=now();

    update public.cameras set analysis_plan_code='intensive',updated_at=now() where id=v_row.camera_id and organization_id=v_contract.organization_id;
  end loop;

  insert into public.vip_project_members(project_id,organization_id,user_id,role,status,source,added_by)
  select v_project.id,m.organization_id,m.user_id,m.role::text,'active','organization_sync',p_actor_user_id
  from public.organization_members m where m.organization_id=v_contract.organization_id
  on conflict(project_id,user_id) do update set role=excluded.role,status='active',removed_at=null,updated_at=now();

  insert into public.vip_project_features(project_id,feature_code,enabled,source,config,updated_by)
  select v_project.id,f.code,f.default_enabled_vip,'catalog_default','{}'::jsonb,p_actor_user_id from public.vip_feature_catalog f
  on conflict(project_id,feature_code) do nothing;

  update public.vip_contracts set status='active',activated_at=coalesce(activated_at,now()),updated_at=now(),metadata=metadata||jsonb_build_object('activationPending',false,'activatedByGate',5)
  where id=v_contract.id returning * into v_contract;

  perform public.transition_vip_project(v_project.id,'active',p_actor_user_id,null,jsonb_build_object('source','vip_paid_contract_activation','contractId',v_contract.id,'invoiceId',v_invoice.id,'paymentId',v_payment.id));

  select count(*) into v_active from public.vip_project_cameras where project_id=v_project.id and status='active';
  select count(*) into v_sites from public.vip_project_sites where project_id=v_project.id and status='active';
  select count(*) into v_members from public.vip_project_members where project_id=v_project.id and status='active';
  select count(*) into v_features from public.vip_project_features where project_id=v_project.id and enabled;

  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values(v_contract.organization_id,p_actor_user_id,'vip.contract_activated','vip_contract',v_contract.id::text,jsonb_build_object('projectId',v_project.id,'trialRunId',v_trial.id,'activeCameras',v_active,'contractedCameras',v_contract.contracted_camera_count,'activeSites',v_sites,'activeMembers',v_members,'enabledFeatures',v_features));

  return jsonb_build_object('success',true,'duplicate',false,'status','active','contractId',v_contract.id,'projectId',v_project.id,'contractedCameras',v_contract.contracted_camera_count,'activeCameras',v_active,'remainingCapacity',greatest(v_contract.contracted_camera_count-v_active,0),'activeSites',v_sites,'activeMembers',v_members,'enabledFeatures',v_features);
end;
$$;
revoke all on function public.activate_paid_vip_contract_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_paid_vip_contract_v1(uuid,uuid) to service_role;

create or replace function public.assign_vip_camera_v1(p_project_id uuid,p_camera_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project public.vip_projects%rowtype; v_contract public.vip_contracts%rowtype; v_camera public.cameras%rowtype; v_count integer;
begin
  perform private.require_monitoria_service_role();
  select * into v_project from public.vip_projects where id=p_project_id for update;
  if not found or v_project.organization_id is null or v_project.status<>'active' then raise exception 'vip_project_not_active'; end if;
  if not exists(select 1 from public.organization_members where organization_id=v_project.organization_id and user_id=p_actor_user_id and role in ('owner'::public.organization_role,'admin'::public.organization_role)) then raise exception 'not_authorized'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_project.id::text||':vip-camera-capacity',0));
  select * into v_contract from public.vip_contracts where project_id=v_project.id and status in ('active','grace_period') order by activated_at desc nulls last,created_at desc limit 1 for update;
  if not found or not private.vip_contract_is_current(v_contract) then raise exception 'vip_contract_not_current'; end if;
  select * into v_camera from public.cameras where id=p_camera_id and organization_id=v_project.organization_id;
  if not found then raise exception 'vip_camera_not_found'; end if;
  if exists(select 1 from public.vip_project_cameras where camera_id=v_camera.id and project_id<>v_project.id and status='active') then raise exception 'vip_camera_already_in_another_project'; end if;
  select count(*) into v_count from public.vip_project_cameras where project_id=v_project.id and status='active' and camera_id<>v_camera.id;
  if v_count>=v_contract.contracted_camera_count then raise exception 'vip_camera_capacity_exceeded'; end if;

  insert into public.vip_project_sites(project_id,organization_id,site_id,status,linked_source) values(v_project.id,v_project.organization_id,v_camera.site_id,'active','manual')
  on conflict(project_id,site_id) do update set status='active',removed_at=null,updated_at=now();
  insert into public.vip_project_cameras(project_id,organization_id,camera_id,site_id,status,linked_source,linked_by)
  values(v_project.id,v_project.organization_id,v_camera.id,v_camera.site_id,'active','manual',p_actor_user_id)
  on conflict(project_id,camera_id) do update set site_id=excluded.site_id,status='active',linked_source='manual',linked_by=p_actor_user_id,linked_at=now(),removed_at=null,updated_at=now();
  update public.cameras set analysis_plan_code='intensive',updated_at=now() where id=v_camera.id;
  select count(*) into v_count from public.vip_project_cameras where project_id=v_project.id and status='active';
  return jsonb_build_object('success',true,'projectId',v_project.id,'cameraId',v_camera.id,'activeCameras',v_count,'contractedCameras',v_contract.contracted_camera_count,'remainingCapacity',greatest(v_contract.contracted_camera_count-v_count,0));
end;
$$;
revoke all on function public.assign_vip_camera_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.assign_vip_camera_v1(uuid,uuid,uuid) to service_role;

create or replace function public.remove_vip_camera_v1(p_project_id uuid,p_camera_id uuid,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project public.vip_projects%rowtype; v_contract public.vip_contracts%rowtype; v_count integer;
begin
  perform private.require_monitoria_service_role();
  select * into v_project from public.vip_projects where id=p_project_id for update;
  if not found or v_project.organization_id is null or v_project.status<>'active' then raise exception 'vip_project_not_active'; end if;
  if not exists(select 1 from public.organization_members where organization_id=v_project.organization_id and user_id=p_actor_user_id and role in ('owner'::public.organization_role,'admin'::public.organization_role)) then raise exception 'not_authorized'; end if;
  select * into v_contract from public.vip_contracts where project_id=v_project.id and status in ('active','grace_period') order by activated_at desc nulls last,created_at desc limit 1;
  update public.vip_project_cameras set status='removed',removed_at=now(),updated_at=now() where project_id=v_project.id and camera_id=p_camera_id and status='active';
  if not found then raise exception 'vip_camera_not_assigned'; end if;
  update public.vip_project_sites s set status='removed',removed_at=now(),updated_at=now()
   where s.project_id=v_project.id and s.status='active' and not exists(select 1 from public.vip_project_cameras c where c.project_id=v_project.id and c.site_id=s.site_id and c.status='active');
  select count(*) into v_count from public.vip_project_cameras where project_id=v_project.id and status='active';
  return jsonb_build_object('success',true,'projectId',v_project.id,'cameraId',p_camera_id,'activeCameras',v_count,'contractedCameras',coalesce(v_contract.contracted_camera_count,0),'remainingCapacity',greatest(coalesce(v_contract.contracted_camera_count,0)-v_count,0));
end;
$$;
revoke all on function public.remove_vip_camera_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_vip_camera_v1(uuid,uuid,uuid) to service_role;

create or replace function public.set_vip_project_feature_v1(p_project_id uuid,p_feature_code text,p_enabled boolean,p_config jsonb,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_project public.vip_projects%rowtype;
begin
  perform private.require_monitoria_service_role();
  if p_config is null or jsonb_typeof(p_config)<>'object' then raise exception 'vip_feature_config_invalid'; end if;
  select * into v_project from public.vip_projects where id=p_project_id for update;
  if not found or v_project.organization_id is null or v_project.status<>'active' then raise exception 'vip_project_not_active'; end if;
  if not exists(select 1 from public.organization_members where organization_id=v_project.organization_id and user_id=p_actor_user_id and role in ('owner'::public.organization_role,'admin'::public.organization_role)) then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.vip_feature_catalog where code=p_feature_code) then raise exception 'vip_feature_not_found'; end if;
  insert into public.vip_project_features(project_id,feature_code,enabled,source,config,updated_by)
  values(v_project.id,p_feature_code,coalesce(p_enabled,false),'override',p_config,p_actor_user_id)
  on conflict(project_id,feature_code) do update set enabled=excluded.enabled,source='override',config=excluded.config,updated_by=excluded.updated_by,updated_at=now();
  return jsonb_build_object('success',true,'projectId',v_project.id,'featureCode',p_feature_code,'enabled',coalesce(p_enabled,false));
end;
$$;
revoke all on function public.set_vip_project_feature_v1(uuid,text,boolean,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.set_vip_project_feature_v1(uuid,text,boolean,jsonb,uuid) to service_role;
