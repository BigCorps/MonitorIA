-- Evita reavaliar auth.uid() para cada linha.
drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self on public.organizations
for insert to authenticated
with check (created_by = (select auth.uid()));
