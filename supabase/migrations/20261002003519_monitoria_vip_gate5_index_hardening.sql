create index if not exists vip_project_cameras_linked_by_idx on public.vip_project_cameras(linked_by) where linked_by is not null;
create index if not exists vip_project_members_added_by_idx on public.vip_project_members(added_by) where added_by is not null;
create index if not exists vip_project_features_updated_by_idx on public.vip_project_features(updated_by) where updated_by is not null;
