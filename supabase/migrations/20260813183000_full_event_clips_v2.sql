-- MonitorIA - clipes do acontecimento completo
-- Alinha banco, plano Detalhada e limite do Storage ao Agent 0.15.2.

begin;

alter table public.clip_generation_requests
  drop constraint if exists clip_generation_requests_duration_seconds_check;

alter table public.clip_generation_requests
  add constraint clip_generation_requests_duration_seconds_check
  check (duration_seconds between 5 and 310);

alter table public.camera_plan_catalog
  drop constraint if exists camera_plan_catalog_clip_duration_seconds_check;

alter table public.camera_plan_catalog
  add constraint camera_plan_catalog_clip_duration_seconds_check
  check (
    clip_duration_seconds is null
    or clip_duration_seconds between 5 and 310
  );

update public.camera_plan_catalog
set clip_duration_seconds = 310
where code = 'intensive';

update storage.buckets
set file_size_limit = 104857600
where id = 'event-clips';

commit;
