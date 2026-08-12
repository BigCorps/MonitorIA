alter table public.cameras
  add column if not exists setup_named_at timestamptz;

-- Câmeras que já existiam antes deste fluxo são consideradas identificadas,
-- para não devolver clientes existentes ao primeiro acesso.
update public.cameras
set setup_named_at = coalesce(updated_at, created_at, now())
where setup_named_at is null;

comment on column public.cameras.setup_named_at is
  'Momento em que o usuário confirmou o nome da câmera após a descoberta. Novas câmeras descobertas começam nulas.';
