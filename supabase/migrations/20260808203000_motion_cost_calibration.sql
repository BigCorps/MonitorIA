-- MonitorIA Agent 0.10.2
--
-- Aplica a calibração de custo somente às câmeras que ainda conservam todos
-- os valores antigos do plano Detalhada. Configurações personalizadas não são
-- tocadas. Não há alteração de schema, RLS ou dados históricos.

update public.cameras
set
  consolidation_interval_seconds = 5,
  event_close_after_seconds = 15,
  motion_start_consecutive_frames = 3,
  motion_end_consecutive_frames = 8,
  motion_cooldown_seconds = 15,
  updated_at = now()
where analysis_plan_code = 'intensive'
  and capture_interval_seconds = 1
  and consolidation_interval_seconds = 1
  and motion_start_threshold = 1
  and motion_continue_threshold = 0.5
  and event_close_after_seconds = 8
  and motion_start_consecutive_frames = 2
  and motion_end_consecutive_frames = 5
  and motion_cooldown_seconds = 5;
