-- Corrige as permissões do hook-base usado pelo hook combinado.
-- Não altera a função e não muda o hook selecionado no painel.

grant usage on schema public to supabase_auth_admin;

grant execute
on function public.custom_access_token_hook(jsonb)
to supabase_auth_admin;

revoke execute
on function public.custom_access_token_hook(jsonb)
from authenticated, anon, public;
