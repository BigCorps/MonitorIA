grant usage on schema private
to monitoria_mcp_readonly;

grant execute
on function private.mcp_client_id()
to monitoria_mcp_readonly;

grant execute
on function private.mcp_org_granted(uuid)
to monitoria_mcp_readonly;
