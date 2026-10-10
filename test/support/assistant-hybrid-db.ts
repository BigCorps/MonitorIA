import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { readFile } from "node:fs/promises";

export const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const ORG = uuid(900), OTHER_ORG = uuid(901), USER = uuid(902), OTHER_USER = uuid(903);
export const CAM = uuid(910), STOCK = uuid(911), SITE = uuid(920), OTHER_SITE = uuid(921), ZONE = uuid(930);
export const vector768 = (axis = 0) => JSON.stringify(Array.from({ length: 768 }, (_, i) => i === axis ? 1 : 0));

/** Minimal schema fixture matching the migration's dependencies; no remote DSN. */
export async function createHybridFixture() {
  const db = new PGlite({ extensions: { vector } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema private; create schema extensions;
    create extension vector with schema extensions;
    grant usage on schema public,auth,extensions to anon,authenticated,service_role;
    grant usage on schema private to authenticated;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
    create table public.organizations(id uuid primary key);
    create table public.organization_members(organization_id uuid,user_id uuid);
    create table public.mcp_oauth_grants(organization_id uuid,user_id uuid,client_id text,revoked_at timestamptz);
    create function private.mcp_org_granted(org uuid) returns boolean language sql stable security definer set search_path='' as $$
      select auth.jwt()->>'client_id' is null or exists(select 1 from public.mcp_oauth_grants g
        where g.user_id=auth.uid() and g.organization_id=org and g.client_id=auth.jwt()->>'client_id' and revoked_at is null) $$;
    create function private.is_org_member(target_organization_id uuid) returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.organization_members m where m.organization_id=target_organization_id and m.user_id=auth.uid())
        and private.mcp_org_granted(target_organization_id) $$;
    create function private.user_effective_mfa_required(user_id uuid) returns boolean language sql stable as $$ select true $$;
    create table public.sites(id uuid primary key,organization_id uuid,name text,timezone text);
    create table public.cameras(id uuid primary key,organization_id uuid,site_id uuid,name text);
    create table public.events(id uuid primary key,organization_id uuid not null references public.organizations(id),
      camera_id uuid,site_id uuid,headline text,summary text,primary_event_type text,corrected_event_type text,
      started_at timestamptz,ended_at timestamptz,expires_at timestamptz,deleted_at timestamptz,
      updated_at timestamptz default now(),zone_ids uuid[] default '{}',tags text[] default '{}',
      analyzed_payload jsonb default '{}',confidence numeric default 0.9,requires_review boolean default false,
      review_status text default 'not_required',human_verdict text,human_reviewed_at timestamptz,
      after_confirmed_closing boolean default false,operational_session_id uuid,interaction_group_id uuid,
      search_document tsvector generated always as(to_tsvector('portuguese',coalesce(headline,'')||' '||coalesce(summary,''))) stored);
    create index on public.events using gin(search_document);
    create table public.event_people(event_id uuid,organization_id uuid);
    create table public.event_vehicles(event_id uuid,organization_id uuid);
    create table public.event_embeddings(event_id uuid primary key references public.events(id) on delete cascade,
      organization_id uuid references public.organizations(id),model text,dimensions int,embedding extensions.vector,created_at timestamptz default now());
    create table public.intelligent_alerts(organization_id uuid,status text,evidence_event_ids uuid[]);
    create table public.operational_deviations(organization_id uuid,status text,evidence_event_ids uuid[]);
  `);
  for (const table of ["events","cameras","sites","event_embeddings","event_people","event_vehicles","intelligent_alerts","operational_deviations"]) {
    await db.exec(`alter table public.${table} enable row level security;
      create policy member_read on public.${table} for select to authenticated using(private.is_org_member(organization_id));
      grant select on public.${table} to authenticated;
      grant all on public.${table} to service_role;`);
  }
  await db.exec(await readFile("supabase/migrations/20260801170510_mfa_rls_enforcement.sql", "utf8"));
  await db.exec(await readFile("supabase/migrations/20261010190245_assistant_hybrid_search_v3.sql", "utf8"));
  await db.exec(`insert into organizations values('${ORG}'),('${OTHER_ORG}');
    insert into organization_members values('${ORG}','${USER}'),('${OTHER_ORG}','${OTHER_USER}');
    insert into sites values('${SITE}','${ORG}','Centro','America/Sao_Paulo'),('${OTHER_SITE}','${ORG}','Filial','America/Sao_Paulo');
    insert into cameras values('${CAM}','${ORG}','${SITE}','Entrada'),('${STOCK}','${ORG}','${SITE}','Estoque');`);
  const corpus = [
    { n: 1, text: "Entrega de pacote na porta", type: "delivery", axis: 0, age: "adult", zone: ZONE },
    { n: 2, text: "Recebimento de encomenda", type: "delivery", axis: 0, age: "adult", zone: ZONE },
    { n: 3, text: "Objeto mochila retirado", type: "object_removed", axis: 1, age: "child", camera: STOCK, zone: uuid(931), review: true, closing: true },
    { n: 4, text: "Pessoa adulta entrou", type: "person_entry", axis: 2, age: "adult", zone: ZONE },
    { n: 5, text: "Objeto com texto infantil na caixa", type: "object", axis: 1, age: "unknown" },
    { n: 6, text: "Pessoa adolescente entrou", type: "person_entry", axis: 2, age: "adolescent" },
    { n: 7, text: "Entrega de pacote privada", type: "delivery", axis: 0, org: OTHER_ORG },
    { n: 8, text: "Entrega de pacote vencida", type: "delivery", axis: 0, expired: true },
    { n: 9, text: "Entrega de pacote excluída", type: "delivery", axis: 0, deleted: true },
    { n: 10, text: "Entrega na filial", type: "delivery", axis: 0, site: OTHER_SITE, day: 8 },
    { n: 11, text: "Movimento incomum de pessoa", type: "unusual_activity", axis: 2, review: true, hour: 1 },
    { n: 12, text: "Animal no portão", type: "animal", axis: 3 },
  ];
  for (const item of corpus) {
    const org = item.org ?? ORG;
    await db.query(`insert into events(id,organization_id,camera_id,site_id,headline,summary,primary_event_type,
      started_at,ended_at,expires_at,deleted_at,zone_ids,analyzed_payload,requires_review,after_confirmed_closing)
      values($1,$2,$3,$4,$5,$5,$6,$7,$7,$8,$9,$10,$11,$12,$13)`, [
      uuid(item.n),org,item.camera ?? CAM,item.site ?? SITE,item.text,item.type,
      `2026-10-${item.day ?? 9}T${String(item.hour ?? 14).padStart(2,'0')}:00:00Z`,
      item.expired ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z",
      item.deleted ? "2026-10-09T00:00:00Z" : null,item.zone ? [item.zone] : [],
      JSON.stringify({ people: item.age ? [{ apparentAgeGroup: item.age, apparentAgeGroupConfidence: 0.8 }] : [] }),item.review ?? false,item.closing ?? false,
    ]);
    if (item.age) await db.query('insert into event_people values($1,$2)',[uuid(item.n),org]);
    if (!item.expired && !item.deleted) await db.query(`insert into event_embeddings(event_id,organization_id,model,dimensions,embedding,source_hash,text_version,expires_at)
      select id,organization_id,'text-embedding-3-small',768,$2,assistant_embedding_hash,1,expires_at from events where id=$1`,[uuid(item.n),vector768(item.axis)]);
  }
  return db;
}

export async function asUser(db: PGlite, callback: () => Promise<unknown>, claims: Record<string, unknown> = { sub: USER, aal: "aal2" }, role = "authenticated") {
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
  await db.exec(`set role ${role}`);
  try { return await callback(); } finally { await db.exec("reset role"); }
}

export async function searchFixture(db: PGlite, overrides: Record<string, unknown> = {}) {
  const args: Record<string, unknown> = { p_organization_id: ORG,p_from:"2026-10-09T00:00:00Z",p_to:"2026-10-10T00:00:00Z",p_query:"entrega",p_limit:50,...overrides };
  const keys=Object.keys(args); const params=keys.map((k,i)=>`${k} => $${i+1}`);
  const response=await db.query<{ result: any }>(`select public.assistant_hybrid_event_search_v3(${params.join(',')}) as result`,keys.map(k=>args[k]));
  return response.rows[0].result;
}
