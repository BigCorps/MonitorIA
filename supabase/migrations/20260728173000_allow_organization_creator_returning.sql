-- Permite que o usuário que está criando a organização receba o registro
-- pelo INSERT ... RETURNING antes de o trigger AFTER INSERT criar o vínculo
-- em organization_members.
--
-- Sem esta condição, o INSERT passa pela policy de INSERT, mas o RETURNING
-- é bloqueado pela policy de SELECT porque o vínculo ainda não existe.

alter policy organizations_select_member
on public.organizations
to authenticated
using (
  created_by = (select auth.uid())
  or private.is_org_member(id)
);
