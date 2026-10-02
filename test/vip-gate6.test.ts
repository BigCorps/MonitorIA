import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("vip.monitoria.cam usa landing pública na raiz e mantém áreas do cliente protegidas", async () => {
  const [proxy, authProxy] = await Promise.all([
    read("proxy.ts"),
    read("src/lib/supabase/proxy.ts"),
  ]);

  assert.match(proxy, /landing\.pathname = "\/vip\/landing"/);
  assert.match(proxy, /NextResponse\.rewrite\(landing\)/);
  assert.doesNotMatch(
    proxy,
    /pathname === "\/"[\s\S]{0,180}pathname = "\/vip\/dashboard"/,
  );

  assert.match(authProxy, /"\/vip\/onboarding"/);
  assert.match(authProxy, /"\/vip\/closing"/);
  assert.match(authProxy, /"\/vip\/dashboard"/);
  assert.doesNotMatch(
    authProxy,
    /const protectedPrefixes = \[[\s\S]{0,120}"\/vip",/,
  );
  assert.match(authProxy, /isVipCustomerPath/);
  assert.match(authProxy, /vipRedirectWithSharedSession/);
});

test("landing VIP é consultiva e não cria conta nem inicia trial diretamente", async () => {
  const page = await read("app/vip/landing/page.tsx");

  assert.match(page, /Solicitar avaliação VIP/);
  assert.match(page, /requestVipContactAction/);
  assert.match(page, /min=\{10\}/);
  assert.match(page, /60 minutos/);
  assert.match(page, /Até 6/);
  assert.match(page, /Intensive/);
  assert.match(page, /Você não precisa criar conta agora/);
  assert.match(page, /ClarityScript/);
  assert.doesNotMatch(page, /login\?criar=1/);
});

test("formulário público grava somente via backend e reduz spam sem Turnstile", async () => {
  const action = await read("app/vip/landing/actions.ts");

  assert.match(action, /createAdminClient/);
  assert.match(action, /vip_lead_requests/);
  assert.match(action, /formData\.get\("website"\)/);
  assert.match(action, /elapsed < 1200/);
  assert.match(action, /\.in\("status", \["new", "contacted", "qualified"\]\)/);
  assert.match(action, /sales_operators/);
  assert.doesNotMatch(action, /captcha|turnstile/i);
});

test("conversão do vendedor usa uma única RPC transacional", async () => {
  const [action, migration] = await Promise.all([
    read("app/comercial/vip/actions.ts"),
    read("supabase/migrations/20261002141720_monitoria_vip_gate6_atomic_lead_conversion.sql"),
  ]);

  assert.match(action, /convert_vip_lead_request_v1/);
  assert.match(action, /createSalesTrialToken/);
  assert.match(action, /hashSalesTrialToken/);
  assert.doesNotMatch(action, /createVipProject/);

  assert.match(migration, /insert into public\.vip_projects/);
  assert.match(migration, /public\.create_vip_sales_invite/);
  assert.match(migration, /update public\.vip_lead_requests/);
  assert.match(migration, /status = 'converted'/);
  assert.match(migration, /private\.require_monitoria_service_role/);
  assert.match(
    migration,
    /revoke all on function public\.convert_vip_lead_request_v1[\s\S]*from public,anon,authenticated/,
  );
});

test("fila comercial mostra novos interesses e sinais de abandono do onboarding", async () => {
  const page = await read("app/comercial/vip/page.tsx");

  assert.match(page, /vip_lead_requests/);
  assert.match(page, /Criar Projeto \+ convite/);
  assert.match(page, /onboarding_attention_code/);
  assert.match(page, /onboarding_last_activity_at/);
  assert.match(page, /resolve_camera_readiness/);
  assert.match(page, /Última atividade há/);
});

test("fila pública não é exposta diretamente ao anon/authenticated", async () => {
  const migration = await read(
    "supabase/migrations/20261002141513_monitoria_vip_gate6_public_lead_queue.sql",
  );

  assert.match(migration, /alter table public\.vip_lead_requests enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.vip_lead_requests from anon, authenticated/,
  );
  assert.match(
    migration,
    /grant all on table public\.vip_lead_requests to service_role/,
  );
  assert.match(migration, /vip_lead_requests_open_email_idx/);
});

test("analytics mede landing VIP sem carregar pixels de anúncios no dashboard VIP", async () => {
  const analytics = await read(
    "src/components/analytics/monitoria-analytics.tsx",
  );

  assert.match(analytics, /'vip\.monitoria\.cam'/);
  assert.match(
    analytics,
    /host === 'vip\.monitoria\.cam' && window\.location\.pathname !== '\/'/,
  );
  assert.match(analytics, /vip_lead_submit/);
  assert.match(analytics, /clarityEvent\(`vip_\$\{vipEvent\}`\)/);
  assert.match(analytics, /data-vip-event/);
});

test("login comercial abre primeiro a operação VIP", async () => {
  const page = await read("app/comercial/page.tsx");
  assert.match(page, /if \(access\) redirect\("\/comercial\/vip"\)/);
});
