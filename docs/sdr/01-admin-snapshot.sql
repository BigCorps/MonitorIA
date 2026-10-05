begin;
-- Server-only reporting boundary. Returns commercial summaries, never video/event content.
create or replace function public.bigcorps_admin_snapshot()
returns jsonb language sql stable security invoker set search_path=public,pg_catalog as $$
with bounds as (
 select date_trunc('month',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as month_start,
 date_trunc('day',now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as today
), rev as (
 select i.id,i.organization_id,i.total_cents,i.paid_at,
 case when i.metadata->>'productFamily'='monitoria_vip' or exists(select 1 from public.vip_contracts v where v.invoice_id=i.id) then 'monitoria_vip' else 'monitoria' end as product
 from public.billing_invoices i where i.status::text='paid' and i.paid_at is not null and i.total_cents>0
), recurring as (
 select 'monitoria_vip'::text as product,v.id::text as id,v.organization_id,
 round(v.base_amount_cents::numeric/case when v.billing_cycle='annual' then 12 else 1 end)::bigint
 + case when v.excess_period_end>now() then v.excess_camera_count*v.excess_camera_monthly_cents else 0 end as cents
 from public.vip_contracts v join public.billing_invoices i on i.id=v.invoice_id
 where v.status in ('active','grace_period') and v.paid_at is not null and v.activated_at is not null
 and v.base_period_end>now() and i.status::text='paid' and i.total_cents>0
 and coalesce(v.metadata->>'complimentary','false')<>'true'
 union all
 select 'monitoria',c.camera_id::text,c.organization_id,round(p.total_amount_cents::numeric / greatest(1,round(extract(epoch from (p.service_end-p.service_start))/86400/30)))::bigint
 from public.camera_subscriptions c
 join lateral (
   select ii.total_amount_cents,ii.service_start,ii.service_end from public.billing_invoice_items ii join public.billing_invoices i on i.id=ii.invoice_id
   where ii.camera_id=c.camera_id and ii.organization_id=c.organization_id and i.status::text='paid'
   and i.paid_at is not null and ii.item_type='camera_subscription' and ii.total_amount_cents>0 and ii.service_start is not null and ii.service_end>now()
   order by i.paid_at desc limit 1
 ) p on true
 where c.status::text='active' and c.current_period_end>now()
 and not exists(select 1 from public.vip_project_cameras pc join public.vip_contracts v on v.project_id=pc.project_id
   where pc.camera_id=c.camera_id and pc.removed_at is null and v.status in ('active','grace_period') and v.base_period_end>now())
), products as (select unnest(array['monitoria','monitoria_vip']) as product)
select jsonb_build_object(
 'generatedAt',now(),
 'products',(select jsonb_agg(jsonb_build_object('productKey',p.product,
 'revenueMonthCents',coalesce((select sum(total_cents) from rev,bounds where product=p.product and paid_at>=month_start),0),
 'revenueTodayCents',coalesce((select sum(total_cents) from rev,bounds where product=p.product and paid_at>=today),0),
 'revenue30dCents',coalesce((select sum(total_cents) from rev where product=p.product and paid_at>=now()-interval '30 days'),0),
 'paymentsMonth',(select count(*) from rev,bounds where product=p.product and paid_at>=month_start),
 'payingAccounts',(select count(distinct organization_id) from rev,bounds where product=p.product and paid_at>=month_start),
 'mrrCents',coalesce((select sum(cents) from recurring r where r.product=p.product),0),
 'activeSubscriptions',(select count(*) from recurring r where r.product=p.product)
 )) from products p),
 'daily',(select coalesce(jsonb_agg(d),'[]') from (select (paid_at at time zone 'America/Sao_Paulo')::date as date,sum(total_cents) as "revenueCents",count(*) as payments from rev where paid_at>=now()-interval '30 days' group by 1) d),
 'recentPayments',(select coalesce(jsonb_agg(d),'[]') from (select 'monitoria:'||r.id as id,r.product as "productKey",null as "userId",null as email,o.name,r.total_cents as "amountCents",'fatura' as kind,'monitoria.billing_invoices' as source,r.paid_at as "paidAt" from rev r join public.organizations o on o.id=r.organization_id order by r.paid_at desc limit 30) d),
 'leads',(select coalesce(jsonb_agg(d),'[]') from (select id,company_name,lead_name,lead_email,phone,status,source,project_id,created_at from public.vip_lead_requests order by created_at desc limit 100) d),
 'projects',(select coalesce(jsonb_agg(d),'[]') from (select id,name,company_name,status,selected_plan_code,billing_cycle,expected_camera_count,sales_operator_id,activated_at,created_at from public.vip_projects order by created_at desc limit 100) d),
 'contracts',(select coalesce(jsonb_agg(d),'[]') from (select v.id,v.project_id,v.plan_code,v.billing_cycle,v.status,i.status::text as invoice_status,i.total_cents as paid_invoice_cents,v.initial_invoice_total_cents,i.paid_at,v.activated_at,v.base_period_end from public.vip_contracts v left join public.billing_invoices i on i.id=v.invoice_id order by v.created_at desc limit 100) d),
 'organizations',(select count(*) from public.organizations)
);
$$;
revoke all on function public.bigcorps_admin_snapshot() from public,anon,authenticated;
grant execute on function public.bigcorps_admin_snapshot() to service_role;
commit;
