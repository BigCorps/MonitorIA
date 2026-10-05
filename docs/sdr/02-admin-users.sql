begin;
-- Limited identity projection. No password, token, provider or camera evidence is exported.
-- Auth tables are intentionally not granted to service_role. Only this private projection
-- uses owner privileges; the public wrappers and the Next routes retain their own checks.
create schema if not exists bigcorps_private;
revoke all on schema bigcorps_private from public,anon,authenticated;
grant usage on schema bigcorps_private to service_role;
create or replace function bigcorps_private.admin_accounts()
returns table(id uuid,email text,name text,created_at timestamptz,last_sign_in_at timestamptz,organizations jsonb)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
 and session_user not in ('postgres','supabase_admin') then raise exception 'service_only' using errcode='42501';end if;
 return query
 with members as (
  select m.organization_id,m.user_id,m.role::text as role from public.organization_members m
  union all
  select o.id,o.created_by,'owner' from public.organizations o
  where o.created_by is not null and not exists(select 1 from public.organization_members m where m.organization_id=o.id and m.user_id=o.created_by)
 ), orgs as (
  select o.id,o.name,
   exists(select 1 from public.vip_projects p where p.organization_id=o.id and p.status not in ('cancelled','lost')) as vip,
   (select count(*) from public.cameras c where c.organization_id=o.id) as cameras,
   (select count(distinct pc.camera_id) from public.vip_project_cameras pc join public.vip_projects p on p.id=pc.project_id
    where pc.organization_id=o.id and pc.removed_at is null and p.status not in ('cancelled','lost')) as vip_cameras,
   coalesce((select jsonb_agg(distinct cs.plan_code) from public.camera_subscriptions cs where cs.organization_id=o.id),'[]'::jsonb) as plans
  from public.organizations o
 )
 select u.id,u.email::text,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email)::text,
 u.created_at,u.last_sign_in_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'role',m.role,'vip',o.vip,
  'cameras',o.cameras,'vipCameras',o.vip_cameras,'standardCameras',greatest(0,o.cameras-o.vip_cameras),'plans',o.plans) order by o.name,o.id)
  from members m join orgs o on o.id=m.organization_id where m.user_id=u.id),'[]'::jsonb)
 from auth.users u where u.deleted_at is null and u.is_anonymous is not true;
end $$;
revoke all on function bigcorps_private.admin_accounts() from public,anon,authenticated;
grant execute on function bigcorps_private.admin_accounts() to service_role;

create or replace function public.bigcorps_admin_directory(
 p_view text default 'users',p_search text default '',p_product text default 'all',p_page integer default 1,p_per_page integer default 25)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare result jsonb;v_page integer:=greatest(1,least(coalesce(p_page,1),100000));v_size integer:=greatest(1,least(coalesce(p_per_page,25),100));v_search text:=lower(left(trim(coalesce(p_search,'')),120));
begin
 if p_view not in ('users','billing','summary') or p_product not in ('all','standard','vip') then raise exception 'invalid_filter';end if;
 if p_view='billing' then
  with accounts as materialized(select * from bigcorps_private.admin_accounts()),
  rows as (
   select o.id,o.name,a.id as owner_id,a.name as owner_name,a.email,
   exists(select 1 from public.vip_projects v where v.organization_id=o.id and v.status not in ('cancelled','lost')) as vip,
   coalesce(sum(i.total_cents) filter(where i.status::text='paid' and i.paid_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'),0) as paid_month_cents,
   count(i.id) filter(where i.status::text='paid' and i.paid_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as payments_month,
   max(i.paid_at) filter(where i.status::text='paid') as last_paid_at
   from public.organizations o left join accounts a on a.id=o.created_by
   left join public.billing_invoices i on i.organization_id=o.id
   group by o.id,o.name,a.id,a.name,a.email
  ), filtered as (
   select * from rows where (v_search='' or strpos(lower(coalesce(name,'')||' '||coalesce(owner_name,'')||' '||coalesce(email,'')),v_search)>0)
   and (p_product='all' or (p_product='vip' and vip) or (p_product='standard' and not vip))
  ), page as (select * from filtered order by paid_month_cents desc,name,id limit v_size offset (v_page-1)*v_size)
  select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'ownerId',owner_id,'ownerName',owner_name,'email',email,'vip',vip,'paidMonthCents',paid_month_cents,'paymentsMonth',payments_month,'lastPaidAt',last_paid_at) order by paid_month_cents desc,name,id) from page),'[]'::jsonb),
  'pagination',jsonb_build_object('page',v_page,'perPage',v_size,'total',(select count(*) from filtered),'totalPages',greatest(1,ceil((select count(*) from filtered)::numeric/v_size))),
  'generatedAt',now()) into result;
 else
  with accounts as materialized(select * from bigcorps_private.admin_accounts()),
  filtered as (
   select * from accounts a where (v_search='' or strpos(lower(coalesce(a.name,'')||' '||coalesce(a.email,'')||' '||coalesce((select string_agg(j->>'name',' ') from jsonb_array_elements(a.organizations) j),'')),v_search)>0)
   and (p_product='all' or exists(select 1 from jsonb_array_elements(a.organizations) j where
    (p_product='vip' and (j->>'vip')::boolean) or (p_product='standard' and ((j->>'standardCameras')::bigint>0 or not (j->>'vip')::boolean))))
  ), page as (select * from filtered where p_view='users' order by last_sign_in_at desc nulls last,created_at desc,id limit v_size offset (v_page-1)*v_size)
  select jsonb_build_object('summary',jsonb_build_object(
   'totalUsers',(select count(*) from accounts),
   'newUsers7d',(select count(*) from accounts where created_at>=now()-interval '7 days'),
   'newUsers30d',(select count(*) from accounts where created_at>=now()-interval '30 days'),
   'signedIn30d',(select count(*) from accounts where last_sign_in_at>=now()-interval '30 days'),
   'neverSignedIn',(select count(*) from accounts where last_sign_in_at is null),
   'vipUsers',(select count(*) from accounts a where exists(select 1 from jsonb_array_elements(a.organizations) j where (j->>'vip')::boolean)),
   'standardUsers',(select count(*) from accounts a where exists(select 1 from jsonb_array_elements(a.organizations) j where (j->>'standardCameras')::bigint>0 or not (j->>'vip')::boolean)),
   'organizations',(select count(*) from public.organizations),'cameras',(select count(*) from public.cameras),
   'payingOrganizationsMonth',(select count(distinct organization_id) from public.billing_invoices where status::text='paid' and total_cents>0 and paid_at>=date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')),
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'createdAt',created_at,'lastSignInAt',last_sign_in_at,'organizations',organizations) order by last_sign_in_at desc nulls last,created_at desc,id) from page),'[]'::jsonb),
   'pagination',jsonb_build_object('page',v_page,'perPage',v_size,'total',(select count(*) from filtered),'totalPages',greatest(1,ceil((select count(*) from filtered)::numeric/v_size))),
   'generatedAt',now()) into result;
 end if;
 return result;
end $$;
revoke all on function public.bigcorps_admin_directory(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.bigcorps_admin_directory(text,text,text,integer,integer) to service_role;
commit;
