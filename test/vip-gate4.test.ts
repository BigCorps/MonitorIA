import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Gate 4 move o pós-trial para o fechamento VIP sem alterar a página técnica", async () => {
  const layout = await read("app/vip/onboarding/layout.tsx");

  assert.match(layout, /project\.status === "trial_completed"/);
  assert.match(layout, /project\.status === "proposal"/);
  assert.match(layout, /project\.status === "payment_pending"/);
  assert.match(layout, /redirect\("\/vip\/closing"\)/);
});

test("cliente recebe prova de valor, Pesquisa IA e escolha mensal ou anual", async () => {
  const [page, actions, payment] = await Promise.all([
    read("app/vip/closing/page.tsx"),
    read("app/vip/closing/actions.ts"),
    read("app/vip/closing/vip-payment-panel.tsx"),
  ]);

  assert.match(page, /PROVA DE VALOR/);
  assert.match(page, /VipAssistantPanel/);
  assert.match(page, /name="billing_cycle" value="monthly"/);
  assert.match(page, /name="billing_cycle" value="annual"/);
  assert.match(page, /Os excedentes continuam mensais/);
  assert.match(actions, /getVipProposalForProject/);
  assert.match(actions, /acceptVipProposal/);
  assert.match(payment, /monitoria-create-pix/);
  assert.match(payment, /monitoria-check-pix/);
  assert.match(
    payment,
    /Pagamento confirmado\. Seu ambiente VIP está sendo preparado para ativação/,
  );
});

test("vendedor VIP vê apenas projeto atribuído e não aceita pelo cliente", async () => {
  const [list, detail, actions] = await Promise.all([
    read("app/comercial/vip/page.tsx"),
    read("app/comercial/vip/[projectId]/page.tsx"),
    read("app/comercial/vip/[projectId]/actions.ts"),
  ]);

  assert.match(list, /requireCommercialAccess/);
  assert.match(list, /\.eq\(\s*"sales_operator_id"/);
  assert.match(detail, /String\(project\.sales_operator_id\)/);
  assert.match(actions, /presentVipProposal/);
  assert.match(actions, /reopenVipProposal/);
  assert.doesNotMatch(actions, /acceptVipProposal/);
  assert.doesNotMatch(
    detail,
    /\.select\([^)]*(?:rtsp|password|credential|stream_url|username)/is,
  );
  assert.match(detail, /não consulta senha, RTSP, token de câmera/);
});

test("contrato VIP é por projeto e não cria camera_subscriptions", async () => {
  const [foundation, pix] = await Promise.all([
    read("supabase/migrations/20261001175640_monitoria_vip_gate4_commercial_contracts.sql"),
    read("supabase/migrations/20261001175809_monitoria_vip_gate4_pix_confirmation.sql"),
  ]);

  assert.match(foundation, /create table public\.vip_proposals/);
  assert.match(foundation, /create table public\.vip_contracts/);
  assert.match(foundation, /'vip_contract_base'/);
  assert.match(foundation, /'vip_contract_excess'/);
  assert.match(foundation, /annualPayNowCents/);
  assert.match(foundation, /v_selected\.annual_amount_cents \+ v_monthly_excess/);
  assert.doesNotMatch(pix, /insert into public\.camera_subscriptions/i);
  assert.match(pix, /status='paid_pending_activation'/);
});

test("dispatcher Pix preserva VIP, câmeras padrão e créditos do Assistente", async () => {
  const pix = await read(
    "supabase/migrations/20261001175809_monitoria_vip_gate4_pix_confirmation.sql",
  );

  assert.match(pix, /apply_confirmed_vip_contract_pix_payment/);
  assert.match(pix, /apply_confirmed_monitoria_pix_payment/);
  assert.match(pix, /apply_confirmed_assistant_credit_pix_payment/);
  assert.match(pix, /vip_invoice_mixed_items_not_supported/);
});

test("reabrir proposta preserva histórico sem bloquear novo aceite", async () => {
  const [foundation, hardening] = await Promise.all([
    read("supabase/migrations/20261001175640_monitoria_vip_gate4_commercial_contracts.sql"),
    read("supabase/migrations/20261001175728_monitoria_vip_gate4_contract_retry_hardening.sql"),
  ]);

  assert.match(foundation, /reopen_vip_proposal_v1/);
  assert.match(foundation, /vip_payment_already_confirmed/);
  assert.match(hardening, /drop constraint if exists vip_contracts_project_id_key/);
  assert.match(hardening, /vip_contracts_one_open_project_idx/);
  assert.match(hardening, /where status in \('awaiting_payment','paid_pending_activation','active','grace_period','suspended'\)/);
});

test("RPCs comerciais são chamadas somente pelo backend server-side", async () => {
  const source = await read("src/vip/proposal.ts");

  assert.match(source, /createAdminClient/);
  assert.match(source, /present_vip_proposal_v1/);
  assert.match(source, /accept_vip_proposal_v1/);
  assert.match(source, /reopen_vip_proposal_v1/);
  assert.match(source, /import "server-only"/);
});


test("reabertura repetida procura somente o contrato awaiting_payment mais recente", async () => {
  const sql = await read(
    "supabase/migrations/20261001181538_monitoria_vip_gate4_reopen_hardening.sql",
  );

  assert.match(sql, /contract\.status = 'awaiting_payment'/);
  assert.match(sql, /order by contract\.created_at desc/);
  assert.match(sql, /limit 1/);
  assert.match(sql, /vip_payment_already_confirmed/);
});
