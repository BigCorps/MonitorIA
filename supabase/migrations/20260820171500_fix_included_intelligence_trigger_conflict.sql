-- MonitorIA — hotfix conflito de triggers de inteligências incluídas.
--
-- Pré-requisito:
-- 20260820170000_fix_onboarding_visual_access_state.sql já aplicado.
--
-- Problema:
-- cameras_apply_included_intelligence habilita as inteligências incluídas,
-- porém o trigger legado cameras_apply_plan_intelligence_v1 roda depois e,
-- no plano basic, volta a desligar visual_state/short_memory/etc.
--
-- Correção:
-- 1. remove SOMENTE o trigger legado conflitante;
-- 2. mantém a função histórica no banco, sem execução automática;
-- 3. reaplica os flags incluídos nas câmeras atuais;
-- 4. repete o sync das entidades access_barrier nos perfis ativos.
--
-- Não altera Agent, planos/catálogos, eventos, perfis, zonas ou Pesquisa IA.

begin;

-- O trigger novo `cameras_apply_included_intelligence` passa a ser a única
-- regra automática para esses flags quando analysis_plan_code é inserido
-- ou alterado.
drop trigger if exists cameras_apply_plan_intelligence_v1
  on public.cameras;

-- Corrige as câmeras já existentes sem mudar o plano contratado.
update public.cameras
set
  visual_state_enabled = true,
  short_memory_enabled = true,
  operational_sessions_enabled = true,
  routine_intelligence_enabled = true,
  process_intelligence_enabled = true,
  staff_profile_intelligence_enabled = true,
  health_intelligence_enabled = true,
  vehicle_memory_enabled = true
where analysis_plan_code in ('basic', 'standard', 'intensive')
  and (
    not visual_state_enabled
    or not short_memory_enabled
    or not operational_sessions_enabled
    or not routine_intelligence_enabled
    or not process_intelligence_enabled
    or not staff_profile_intelligence_enabled
    or not health_intelligence_enabled
    or not vehicle_memory_enabled
  );

-- Agora que todas as câmeras incluídas têm visual_state_enabled=true,
-- repete de forma idempotente o sync das barreiras dos perfis ativos.
do $backfill$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select cp.id
    from public.camera_profiles cp
    join public.cameras c
      on c.id = cp.camera_id
     and c.organization_id = cp.organization_id
    where cp.is_active
      and c.visual_state_enabled
  loop
    perform private.monitoria_sync_primary_access_barrier_v1(
      v_profile_id
    );
  end loop;
end;
$backfill$;

commit;
