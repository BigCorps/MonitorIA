-- MonitorIA v0.8.2
-- Mantém o histórico de conversa privado para o usuário que o criou.

drop policy if exists assistant_threads_select
  on public.assistant_threads;

create policy assistant_threads_select
on public.assistant_threads
for select
to authenticated
using (
  private.is_org_member(organization_id)
  and created_by = (select auth.uid())
);

drop policy if exists assistant_messages_select
  on public.assistant_messages;

create policy assistant_messages_select
on public.assistant_messages
for select
to authenticated
using (
  private.is_org_member(organization_id)
  and exists (
    select 1
    from public.assistant_threads thread
    where thread.id = assistant_messages.thread_id
      and thread.organization_id =
        assistant_messages.organization_id
      and thread.created_by = (select auth.uid())
  )
);
