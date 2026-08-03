-- MonitorIA Fase 6 — integração transparente com a rota atual do Assistente

create or replace function private.reserve_assistant_message_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
begin
  if new.role <> 'user' or new.created_by is null then
    return new;
  end if;

  v_usage_id := private.reserve_assistant_interaction(
    new.organization_id,
    'assistant-message:' || new.id::text,
    new.thread_id,
    new.id,
    new.created_by,
    jsonb_build_object(
      'channel', 'dashboard',
      'reservationOrigin', 'assistant_messages_before_insert'
    )
  );

  return new;
exception
  when unique_violation then
    raise exception 'assistant_request_already_running';
end;
$$;

create or replace function private.complete_assistant_message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
  v_input_tokens integer;
  v_output_tokens integer;
begin
  if new.role <> 'assistant' then
    return new;
  end if;

  select usage_event.id
    into v_usage_id
  from public.assistant_usage_events usage_event
  where usage_event.organization_id = new.organization_id
    and usage_event.thread_id = new.thread_id
    and usage_event.status = 'reserved'
    and usage_event.message_id is not null
  order by usage_event.reserved_at desc, usage_event.created_at desc
  limit 1;

  if v_usage_id is null then
    return new;
  end if;

  v_input_tokens := greatest(
    coalesce(
      nullif(new.usage->>'inputTokens', '')::integer,
      nullif(new.usage->>'input_tokens', '')::integer,
      0
    ),
    0
  );

  v_output_tokens := greatest(
    coalesce(
      nullif(new.usage->>'outputTokens', '')::integer,
      nullif(new.usage->>'output_tokens', '')::integer,
      0
    ),
    0
  );

  perform private.complete_assistant_interaction(
    v_usage_id,
    new.id,
    new.model,
    v_input_tokens,
    v_output_tokens,
    new.estimated_cost_usd,
    jsonb_build_object(
      'completionOrigin', 'assistant_messages_after_insert'
    )
  );

  return new;
end;
$$;

create or replace function private.release_assistant_message_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
begin
  if old.role <> 'user' then
    return old;
  end if;

  select usage_event.id
    into v_usage_id
  from public.assistant_usage_events usage_event
  where usage_event.organization_id = old.organization_id
    and usage_event.message_id = old.id
    and usage_event.status = 'reserved'
  limit 1;

  if v_usage_id is not null then
    perform private.release_assistant_interaction(
      v_usage_id,
      'user_message_deleted_before_answer',
      jsonb_build_object(
        'releaseOrigin', 'assistant_messages_after_delete'
      )
    );
  end if;

  return old;
end;
$$;

drop trigger if exists assistant_message_quota_reserve_before_insert
on public.assistant_messages;
create trigger assistant_message_quota_reserve_before_insert
before insert on public.assistant_messages
for each row
execute function private.reserve_assistant_message_before_insert();

drop trigger if exists assistant_message_quota_complete_after_insert
on public.assistant_messages;
create trigger assistant_message_quota_complete_after_insert
after insert on public.assistant_messages
for each row
execute function private.complete_assistant_message_after_insert();

drop trigger if exists assistant_message_quota_release_after_delete
on public.assistant_messages;
create trigger assistant_message_quota_release_after_delete
after delete on public.assistant_messages
for each row
execute function private.release_assistant_message_after_delete();

revoke all on function private.reserve_assistant_message_before_insert()
from public, anon, authenticated;
revoke all on function private.complete_assistant_message_after_insert()
from public, anon, authenticated;
revoke all on function private.release_assistant_message_after_delete()
from public, anon, authenticated;
