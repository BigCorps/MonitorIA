-- MonitorIA Fase 6 — remove a reserva antecipada da Fase 3
-- e mantém apenas o fluxo reserva -> conclusão -> liberação.

drop trigger if exists trg_assistant_messages_reserve_allowance
on public.assistant_messages;

drop trigger if exists trg_assistant_messages_release_allowance
on public.assistant_messages;

drop function if exists private.reserve_monitoria_assistant_interaction();
drop function if exists private.release_monitoria_assistant_interaction();
