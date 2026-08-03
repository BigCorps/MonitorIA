-- MonitorIA — Etapa 2.5
-- Publica a tabela de eventos no Supabase Realtime.
-- A leitura continua protegida pela policy events_select_member.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'events'
  ) then
    alter publication supabase_realtime
      add table public.events;
  end if;
end
$$;
