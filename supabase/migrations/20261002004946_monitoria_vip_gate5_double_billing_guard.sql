-- MonitorIA VIP — Gate 5
-- Uma câmera não pode entrar no entitlement VIP enquanto existir assinatura padrão não cancelada.
create or replace function private.guard_vip_camera_standard_subscription()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.status='active' and exists(
    select 1 from public.camera_subscriptions subscription
    where subscription.camera_id=new.camera_id
      and subscription.status<>'cancelled'
  ) then
    raise exception 'vip_camera_has_standard_subscription';
  end if;
  return new;
end;
$$;

drop trigger if exists vip_project_camera_standard_subscription_guard on public.vip_project_cameras;
create trigger vip_project_camera_standard_subscription_guard
before insert or update of camera_id,status on public.vip_project_cameras
for each row execute function private.guard_vip_camera_standard_subscription();
