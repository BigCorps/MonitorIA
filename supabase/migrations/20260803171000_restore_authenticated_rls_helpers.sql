begin;

-- O schema já possui USAGE atualmente, mas este GRANT
-- deixa a migration idempotente e explícita.
grant usage on schema private to authenticated;

-- Função usada pelas políticas SELECT das organizações,
-- membros, locais, câmeras e demais recursos.
grant execute
on function private.is_org_member(uuid)
to authenticated;

-- Função usada pelas políticas de INSERT, UPDATE e DELETE
-- para owners e administradores.
grant execute
on function private.has_org_role(
  uuid,
  public.organization_role[]
)
to authenticated;

commit;