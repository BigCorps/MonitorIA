-- MonitorIA 1.0.2 RC - pós-verificação
-- Ajustes exclusivamente de índices identificados após aplicação em produção.
-- Não altera dados, regras de negócio, trials, análise, clipes ou retenção.

begin;

-- A migration 1.0.2 criou um índice equivalente a um índice que já existia.
-- Mantemos o índice legado clip_requests_agent_status_idx e removemos apenas
-- a cópia redundante para evitar custo de escrita/manutenção duplicado.
drop index if exists public.clip_generation_requests_agent_pending_idx;

-- Índices de suporte para FKs/consultas do recibo durável em escala.
create index if not exists event_ingestions_organization_idx
  on public.event_ingestions(organization_id, created_at desc);

create index if not exists event_ingestions_capture_session_idx
  on public.event_ingestions(capture_session_id)
  where capture_session_id is not null;

commit;
