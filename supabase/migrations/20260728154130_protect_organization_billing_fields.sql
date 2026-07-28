-- Prevent browser clients from setting billing/ownership fields directly.
revoke insert, update on table public.organizations from authenticated;

grant insert (name, slug, created_by) on table public.organizations to authenticated;
grant update (name, slug) on table public.organizations to authenticated;
