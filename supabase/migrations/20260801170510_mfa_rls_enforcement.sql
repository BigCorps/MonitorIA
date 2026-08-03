-- MonitorIA.cam — aplicação de MFA no banco por política RLS restritiva.
--
-- Adiciona uma policy RESTRICTIVE às tabelas públicas com:
-- RLS habilitado, coluna organization_id e pelo menos uma policy existente.

create or replace function public.current_session_meets_mfa_policy()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then false
      when not private.user_effective_mfa_required(
        (select auth.uid())
      ) then true
      else coalesce(
        (select auth.jwt() ->> 'aal') = 'aal2',
        false
      )
    end;
$$;

revoke all on function public.current_session_meets_mfa_policy()
  from public, anon;

grant execute on function public.current_session_meets_mfa_policy()
  to authenticated;

do $$
declare
  target record;
begin
  for target in
    select
      namespace.nspname as schema_name,
      relation.relname as table_name
    from pg_class relation
    join pg_namespace namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relrowsecurity = true
      and exists (
        select 1
        from pg_attribute attribute
        where attribute.attrelid = relation.oid
          and attribute.attname = 'organization_id'
          and attribute.attnum > 0
          and not attribute.attisdropped
      )
      and exists (
        select 1
        from pg_policy policy
        where policy.polrelid = relation.oid
      )
  loop
    execute format(
      'drop policy if exists monitoria_require_mfa on %I.%I',
      target.schema_name,
      target.table_name
    );

    execute format(
      'create policy monitoria_require_mfa
         on %I.%I
         as restrictive
         for all
         to authenticated
         using (
           (select public.current_session_meets_mfa_policy())
         )
         with check (
           (select public.current_session_meets_mfa_policy())
         )',
      target.schema_name,
      target.table_name
    );
  end loop;
end;
$$;

comment on function public.current_session_meets_mfa_policy() is
  'Autoriza operações comuns ou exige JWT AAL2 quando MFA é obrigatório.';
