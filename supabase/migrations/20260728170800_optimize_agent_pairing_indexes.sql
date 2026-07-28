create unique index if not exists agents_token_hash_unique_idx
  on public.agents(agent_token_hash)
  where agent_token_hash is not null;

create index if not exists agent_pairing_codes_organization_idx
  on public.agent_pairing_codes(organization_id);

create index if not exists agent_pairing_codes_site_idx
  on public.agent_pairing_codes(site_id);

create index if not exists agent_pairing_codes_used_agent_idx
  on public.agent_pairing_codes(used_by_agent_id)
  where used_by_agent_id is not null;
