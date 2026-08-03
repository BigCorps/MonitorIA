-- Base de compatibilidade de equipamentos.
--
-- Alimentada por cada instalação bem-sucedida, conforme o item 11 da
-- diretriz de descoberta. Serve para o catálogo de caminhos RTSP crescer com
-- hardware real em vez de depender só de atualização manual do código.
--
-- Duas decisões de privacidade, deliberadas:
--
-- 1. Não há organization_id. O conteúdo é conhecimento sobre modelos de
--    equipamento, não sobre clientes. Sem vínculo, não existe pergunta de
--    vazamento entre organizações.
--
-- 2. Não há senha e não há IP. O caminho é normalizado com marcadores
--    ({USERNAME}, {PASSWORD}, {IP}, {PORT}) antes de sair do Agent.

create table if not exists public.device_compatibility (
  id uuid primary key default gen_random_uuid(),

  vendor text,
  model text,
  firmware text,
  device_type text not null default 'camera'
    check (device_type in ('camera', 'dvr', 'nvr', 'encoder')),

  -- Nível de confiança do caminho no momento em que funcionou.
  source text not null
    check (source in (
      'hardware_validated',
      'official_documentation',
      'onvif_discovered',
      'runtime_validated',
      'heuristic_candidate'
    )),

  rtsp_port integer not null check (rtsp_port between 1 and 65535),
  path_template text not null,
  stream_type text not null check (stream_type in ('main', 'sub')),

  codec text,
  resolution text,
  onvif_supported boolean not null default false,

  success_count integer not null default 0,
  failure_count integer not null default 0,

  agent_version text,
  first_validated_at timestamptz not null default now(),
  validated_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A identidade de uma entrada é o equipamento mais o caminho. Firmware fica
-- de fora da chave de propósito: caminho que funciona costuma sobreviver a
-- atualização de firmware, e separar por versão fragmentaria o catálogo.
create unique index if not exists device_compatibility_identity_idx
  on public.device_compatibility (
    coalesce(vendor, ''),
    coalesce(model, ''),
    device_type,
    path_template,
    rtsp_port,
    stream_type
  );

create index if not exists device_compatibility_vendor_idx
  on public.device_compatibility (vendor, model);

alter table public.device_compatibility enable row level security;

-- Só o serviço escreve. Nenhum cliente autenticado lê diretamente: o catálogo
-- é consumido pelo Agent por meio de rota autenticada, não por RLS.
revoke all privileges on table public.device_compatibility from anon, authenticated;
grant all privileges on table public.device_compatibility to service_role;

create or replace function public.record_device_compatibility(
  p_vendor text,
  p_model text,
  p_firmware text,
  p_device_type text,
  p_source text,
  p_rtsp_port integer,
  p_path_template text,
  p_stream_type text,
  p_codec text,
  p_resolution text,
  p_onvif_supported boolean,
  p_agent_version text,
  p_success boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.device_compatibility (
    vendor, model, firmware, device_type, source,
    rtsp_port, path_template, stream_type,
    codec, resolution, onvif_supported, agent_version,
    success_count, failure_count
  )
  values (
    nullif(trim(p_vendor), ''),
    nullif(trim(p_model), ''),
    nullif(trim(p_firmware), ''),
    coalesce(p_device_type, 'camera'),
    p_source,
    p_rtsp_port,
    p_path_template,
    p_stream_type,
    nullif(trim(p_codec), ''),
    nullif(trim(p_resolution), ''),
    coalesce(p_onvif_supported, false),
    nullif(trim(p_agent_version), ''),
    case when p_success then 1 else 0 end,
    case when p_success then 0 else 1 end
  )
  on conflict (
    coalesce(vendor, ''),
    coalesce(model, ''),
    device_type,
    path_template,
    rtsp_port,
    stream_type
  )
  do update set
    -- Um caminho que funcionou em cliente real sobe de nível. É o único
    -- caminho de promoção automática; hardware_validated continua exigindo
    -- teste físico da equipe.
    source = case
      when device_compatibility.source in ('heuristic_candidate', 'official_documentation')
        and p_success
      then 'runtime_validated'
      else device_compatibility.source
    end,
    firmware = coalesce(nullif(trim(p_firmware), ''), device_compatibility.firmware),
    codec = coalesce(nullif(trim(p_codec), ''), device_compatibility.codec),
    resolution = coalesce(nullif(trim(p_resolution), ''), device_compatibility.resolution),
    onvif_supported = device_compatibility.onvif_supported or coalesce(p_onvif_supported, false),
    agent_version = coalesce(nullif(trim(p_agent_version), ''), device_compatibility.agent_version),
    success_count = device_compatibility.success_count + case when p_success then 1 else 0 end,
    failure_count = device_compatibility.failure_count + case when p_success then 0 else 1 end,
    validated_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_device_compatibility(
  text, text, text, text, text, integer, text, text, text, text, boolean, text, boolean
) from public, anon, authenticated;

grant execute on function public.record_device_compatibility(
  text, text, text, text, text, integer, text, text, text, text, boolean, text, boolean
) to service_role;

comment on table public.device_compatibility is
  'Catálogo de equipamentos validados em instalações reais. Sem credencial, sem IP e sem vínculo com organização.';
