-- MonitorIA Fase 10 — verificação somente leitura.
-- Resultado esperado: todas as colunas booleanas abaixo devem ser true.

select
  to_regclass('public.privacy_requests') is not null as privacy_requests_exists,
  coalesce((
    select relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'privacy_requests'
  ), false) as privacy_requests_rls_enabled,
  (select count(*) >= 3 from pg_policies
    where schemaname = 'public' and tablename = 'privacy_requests') as privacy_policies_present,
  has_function_privilege(
    'service_role',
    'public.consume_api_rate_limit_v1(text,text,integer,integer)',
    'execute'
  ) as service_can_rate_limit,
  not has_function_privilege(
    'authenticated',
    'public.consume_api_rate_limit_v1(text,text,integer,integer)',
    'execute'
  ) as users_cannot_call_rate_limit,
  has_function_privilege(
    'authenticated',
    'public.assistant_queue_analysis_v1(uuid,timestamptz,timestamptz,uuid,uuid)',
    'execute'
  ) as assistant_queue_rpc_available,
  exists (
    select 1 from pg_trigger
    where tgname = 'block_plate_suggestions_v1' and not tgisinternal
  ) as advanced_plate_write_blocked,
  not has_table_privilege(
    'authenticated', 'public.event_plate_suggestions', 'select'
  ) as plate_data_not_exposed,
  (select count(*) = 0 from public.event_plate_suggestions) as no_plate_data_stored;

select
  count(*) filter (where c.relrowsecurity) = count(*) as all_public_tables_have_rls,
  count(*) as public_table_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p');

select
  count(*) filter (
    where p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) as authenticated_security_definer_count,
  'Revisar somente funções fora da allowlist documentada em docs/FASE-10-SEGURANCA-LGPD.md' as interpretation
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public';
